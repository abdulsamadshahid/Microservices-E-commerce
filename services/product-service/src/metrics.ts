interface MetricCounter {
  [key: string]: number;
}

class MetricsRegistry {
  private requestCount: MetricCounter = {};
  private requestDurationSum: MetricCounter = {};
  private errorCount: MetricCounter = {};

  recordRequest(method: string, route: string, status: number, durationMs: number) {
    const key = `method="${method}",route="${route}",status="${status}"`;
    this.requestCount[key] = (this.requestCount[key] || 0) + 1;
    this.requestDurationSum[key] = (this.requestDurationSum[key] || 0) + durationMs / 1000;

    if (status >= 400) {
      const errKey = `route="${route}",status="${status}"`;
      this.errorCount[errKey] = (this.errorCount[errKey] || 0) + 1;
    }
  }

  toPrometheusFormat(serviceName: string = 'product_service'): string {
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

    return lines.join('\n') + '\n';
  }
}

export const metrics = new MetricsRegistry();
