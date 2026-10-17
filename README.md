# ShopSphere — Microservices E-Commerce on AWS EKS

ShopSphere is a microservices-based e-commerce application deployed on AWS EKS as part of my hands-on DevOps learning journey.

The project covers the deployment lifecycle, from building and pushing Docker images to deploying microservices on Kubernetes, implementing GitOps with Argo CD, and monitoring resource usage.

A major focus was troubleshooting deployment issues and understanding how the different components work together.

## Tech Stack

- **AWS EKS** — Kubernetes orchestration
- **Amazon ECR** — Docker image registry
- **Docker** — Containerization
- **Terraform** — Infrastructure as Code
- **GitHub Actions** — CI/CD automation and image publishing
- **Argo CD** — GitOps-based Kubernetes deployment and synchronization
- **Kubernetes** — Application deployments, services, and configuration
- **Helm** — Monitoring stack installation
- **Prometheus** — Metrics collection
- **Grafana** — Monitoring dashboards
- **PostgreSQL** — Application database

## Architecture Overview

The application follows a microservices architecture with separate frontend and backend services.

- Frontend
- Product service
- Order service
- Inventory service
- PostgreSQL database

The application runs on Amazon EKS, with Kubernetes Services enabling communication between components.

### Deployment Workflow

1. Code is pushed to GitHub.
2. GitHub Actions builds Docker images and pushes them to Amazon ECR.
3. Kubernetes manifests define the desired application state.
4. Argo CD synchronizes Kubernetes manifests from GitHub to the EKS cluster.
5. Kubernetes runs and manages the application workloads.
6. Prometheus collects metrics, which are visualized through Grafana dashboards.

GitHub Actions handles CI and image publishing, while Argo CD handles GitOps-based deployment synchronization.

## GitOps with Argo CD

I integrated Argo CD with my GitHub repository to automate the synchronization of Kubernetes manifests with my EKS cluster.

This reduced the need to manually run `kubectl apply` whenever I changed deployment manifests.

Key concepts explored:

- Connecting a Git repository to Argo CD
- Automated synchronization of Kubernetes manifests
- Self-healing and pruning
- Monitoring application health and synchronization status

This helped me understand how GitOps simplifies deployment management and keeps the cluster aligned with the desired state defined in Git.

## Monitoring

I deployed Prometheus and Grafana using Helm.

The monitoring setup allows me to inspect Kubernetes resource utilization and visualize CPU and memory metrics through Grafana dashboards.

This reinforced the importance of verifying application and infrastructure health after deployment.

## Troubleshooting

One issue I encountered involved Kubernetes Pods failing to start because of Secret configuration problems.

I investigated the Pod status and configuration, corrected the issue, and verified that the affected workloads could start successfully.

I also worked through deployment workflow challenges and explored how Argo CD simplifies Kubernetes manifest synchronization.

These experiences strengthened my understanding of Kubernetes dependencies, configuration management, and troubleshooting using Pod events and logs.

## What I Learned

- Deploying a microservices application on AWS EKS
- Building and publishing Docker images using GitHub Actions and Amazon ECR
- Provisioning infrastructure using Terraform
- Managing Kubernetes Deployments, Services, and Secrets
- Implementing GitOps workflows with Argo CD
- Understanding automated sync, self-healing, and pruning
- Installing monitoring tools using Helm
- Using Prometheus and Grafana to inspect resource utilization
- Troubleshooting Kubernetes deployment failures

## Running the Project

To reproduce the deployment:

1. Configure AWS credentials and the required IAM permissions.
2. Provision the infrastructure using Terraform.
3. Configure application secrets securely without committing sensitive values.
4. Build and push application images to Amazon ECR using GitHub Actions.
5. Configure Argo CD to access the Git repository and synchronize the Kubernetes manifests.
6. Install the monitoring stack using Helm.

Review the Terraform configuration, Kubernetes manifests, GitHub Actions workflows, and Argo CD configuration before deploying to your own AWS account.

**Important:** AWS resources can incur charges. Review the resources created by Terraform and clean them up when they are no longer needed.

## Future Improvements

- Improve monitoring with additional dashboards and alerts.
- Explore application-level metrics for backend services.
- Expand GitOps workflows and secret management practices.

---

This project is part of my ongoing effort to build practical DevOps and cloud engineering skills through hands-on implementation and troubleshooting.