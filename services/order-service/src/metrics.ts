interface MetricCounter {
  [key: string]: number;
}

class OrderMetricsRegistry {
  private requestCount: MetricCounter = {};
  private requestDurationSum: MetricCounter = {};
  private errorCount: MetricCounter = {};
  private ordersCreatedTotal: number = 0;
  private orderCompensationCount: number = 0;

  recordRequest(method: string, route: string, status: number, durationMs: number) {
    const key = `method="${method}",route="${route}",status="${status}"`;
    this.requestCount[key] = (this.requestCount[key] || 0) + 1;
    this.requestDurationSum[key] = (this.requestDurationSum[key] || 0) + durationMs / 1000;

    if (status >= 400) {
      const errKey = `route="${route}",status="${status}"`;
      this.errorCount[errKey] = (this.errorCount[errKey] || 0) + 1;
    }
  }

  recordOrderCreated() {
    this.ordersCreatedTotal += 1;
  }

  recordOrderCompensation() {
    this.orderCompensationCount += 1;
  }

  toPrometheusFormat(serviceName: string = 'order_service'): string {
    const lines: string[] = [
      `# HELP ${serviceName}_http_requests_total Total number of HTTP requests processed`,
      `# TYPE ${serviceName}_http_requests_total counter`,
    ];

    for (const [labels, count] of Object.entries(this.requestCount)) {
      lines.push(`${serviceName}_http_requests_total{${labels}} ${count}`);
    }

    lines.push(
      `# HELP ${serviceName}_http_request_duration_seconds_total Total duration of HTTP requests in seconds`,
      `# TYPE ${serviceName}_http_request_duration_seconds_total counter`
    );
    for (const [labels, duration] of Object.entries(this.requestDurationSum)) {
      lines.push(`${serviceName}_http_request_duration_seconds_total{${labels}} ${duration.toFixed(4)}`);
    }

    lines.push(
      `# HELP ${serviceName}_http_errors_total Total number of HTTP errors`,
      `# TYPE ${serviceName}_http_errors_total counter`
    );
    for (const [labels, count] of Object.entries(this.errorCount)) {
      lines.push(`${serviceName}_http_errors_total{${labels}} ${count}`);
    }

    lines.push(
      `# HELP ${serviceName}_orders_created_total Total successfully created orders`,
      `# TYPE ${serviceName}_orders_created_total counter`,
      `${serviceName}_orders_created_total ${this.ordersCreatedTotal}`,
      `# HELP ${serviceName}_order_compensations_total Total stock compensation events triggered`,
      `# TYPE ${serviceName}_order_compensations_total counter`,
      `${serviceName}_order_compensations_total ${this.orderCompensationCount}`
    );

    return lines.join('\n') + '\n';
  }
}

export const metrics = new OrderMetricsRegistry();
