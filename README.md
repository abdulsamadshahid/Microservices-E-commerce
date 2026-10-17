# ShopSphere — Microservices E-Commerce on AWS EKS

ShopSphere is a microservices-based e-commerce application that I deployed on AWS EKS as part of my hands-on DevOps learning.

The main goal of this project was to work through the complete deployment process, from building and pushing Docker images to deploying microservices on Kubernetes and monitoring resource usage.

I also spent time troubleshooting deployment issues instead of just focusing on getting everything running.

## Tech Stack

- **AWS EKS** — Kubernetes orchestration
- **Amazon ECR** — Docker image registry
- **Docker** — Containerization
- **Terraform** — Infrastructure as Code
- **GitHub Actions** — CI/CD automation
- **Kubernetes** — Application deployments and services
- **Helm** — Monitoring stack installation
- **Prometheus** — Metrics collection
- **Grafana** — Monitoring dashboards
- **PostgreSQL** — Application database

## Architecture Overview

The project uses a microservices architecture with separate frontend and backend services.

- Frontend
- Product service
- Order service
- Inventory service
- PostgreSQL database

The application runs on Amazon EKS, with Kubernetes Services providing communication between the components.

### Deployment Workflow

1. Code is pushed to GitHub.
2. GitHub Actions builds the Docker images.
3. The images are pushed to Amazon ECR.
4. GitHub Actions updates the Kubernetes deployment using the manifests in the repository.
5. The application runs on EKS.
6. Prometheus collects monitoring metrics, which I view through Grafana dashboards.

## Monitoring

I deployed Prometheus and Grafana using Helm.

The monitoring setup lets me inspect Kubernetes resource utilization and view CPU and memory metrics through Grafana.

This was also an opportunity to understand the difference between deploying an application and verifying its health after deployment.

## Troubleshooting

One of the issues I encountered was Kubernetes pods failing to start because of Secret configuration problems.

I investigated the pod status and configuration, corrected the issue, and verified that the affected workloads could start successfully.

Working through issues like this helped me better understand Kubernetes dependencies and why checking pod events and logs is important when a deployment fails.

## What I Learned

- Deploying a microservices application on AWS EKS
- Automating Docker image builds and pushes with GitHub Actions
- Working with Amazon ECR and Kubernetes manifests
- Managing application configuration through Kubernetes Secrets
- Installing monitoring tools with Helm
- Using Prometheus and Grafana to inspect resource utilization
- Troubleshooting Kubernetes deployment failures

## Running the Project

The infrastructure and application deployment depend on the AWS resources, IAM permissions, configuration, and secrets used for this project.

To reproduce the deployment:

1. Configure AWS credentials and the required IAM permissions.
2. Provision the infrastructure using the Terraform configuration.
3. Configure the required application secrets without committing sensitive values.
4. Build and push the application images to Amazon ECR using the GitHub Actions workflow.
5. Deploy the Kubernetes manifests to the EKS cluster.
6. Install the monitoring stack using Helm.

Review the Terraform configuration, Kubernetes manifests, and GitHub Actions workflow before deploying to your own AWS account.

**Important:** AWS resources can incur charges. Review the resources created by Terraform and clean them up when they are no longer needed.

## Next Steps

- Explore GitOps deployment with Argo CD.
- Improve monitoring with additional dashboards and alerts.
- Explore application-level metrics for the backend services.

---

This project is part of my ongoing effort to build practical DevOps and cloud engineering skills through hands-on implementation and troubleshooting.
