# GitHub Actions and AWS ECR

Status (2026-11-20): **live at http://3.109.56.36**. [CI/ECR run 44696518156](https://github.com/balumurugan107/SyncSpace/actions/runs/44696518156) and [automatic EC2 deployment 44696676283](https://github.com/balumurugan107/SyncSpace/actions/runs/44696676283) passed for source commit `639f88c`. Browser/API/WebSocket smoke checks passed and their temporary data was cleaned up. This is HTTP-only single-host delivery; HTTPS/domain and production hardening remain outstanding.

## Workflow

`.github/workflows/ci-ecr.yml` runs frontend tests/build (including TypeScript) and backend typecheck/tests/build on pull requests, pushes to `main`, and manual dispatch. Backend tests migrate a disposable PostgreSQL 17 test database and use Redis 7.4 database 1. No application `.env` is required in CI; the database password in the workflow is only for the ephemeral CI service.

After all three check jobs succeed, pushes/manual runs on `main` publish the existing backend and frontend Dockerfiles as separate `linux/amd64` images. The API image also runs migrations. PRs and manual runs on other branches cannot publish. All action references are pinned to upstream commit SHAs. Docker build contexts exclude `.env` and `.env.*` except the example file.

Both images use `190706546302.dkr.ecr.ap-south-1.amazonaws.com/syncspace`. Tags are `<api|web>-sha-<full-commit>-<run-id>-<attempt>`, so reruns work with immutable ECR tags. Each matrix job records its tag and digest in the Actions summary. There is no mutable `latest` tag. The jobs are independent: one image can publish while the other fails; only a completely successful run should be promoted. Use both digests from that run for deployment. Canceling/failing a run does not delete already-published images.

## Account configuration

1. The configured GitHub remote is `https://github.com/balumurugan107/SyncSpace.git`. Existing Git credential-helper authentication is verified; credentials are never committed.
2. The user selected the private ECR repository `syncspace` in `ap-south-1`, account `190706546302`. Component tag prefixes keep the API and web images distinct. Immutable tags are supported. Enable scanning and set retention according to the deployment/rollback requirements; the workflow deliberately has no repository-creation or deletion permissions.
3. Configure the IAM OIDC provider `https://token.actions.githubusercontent.com` with audience `sts.amazonaws.com` if the account does not already have it. Create a publishing role with the trust and permission policies below, replacing every uppercase placeholder. The role is for image publication only.
4. In GitHub **Settings → Secrets and variables → Actions → Variables**, set:

| Variable | Value |
|---|---|
| `AWS_REGION` | `ap-south-1` (also the workflow default) |
| `AWS_ROLE_ARN` | `arn:aws:iam::190706546302:role/SyncSpaceGitHubEcrPublish` |
| `ECR_REPOSITORY` | `syncspace` (also the workflow default) |

These are configuration values, not access keys. No `AWS_ACCESS_KEY_ID` or `AWS_SECRET_ACCESS_KEY` GitHub secret is needed. Protect `main` and restrict who can change workflows. If the publishing branch changes, update both workflow and IAM subject. If adding a GitHub environment, its OIDC subject changes and the trust policy must be updated before enabling it.

Trust policy (standard AWS partition): this repository enables GitHub immutable OIDC subjects. Its API reports the prefix `repo:balumurugan107@74696482/SyncSpace@1463714917`; the exact IDs must be retained. A name-only subject will be denied.

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {"Federated": "arn:aws:iam::ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com"},
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {"StringEquals": {
      "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
      "token.actions.githubusercontent.com:sub": "repo:balumurugan107@74696482/SyncSpace@1463714917:ref:refs/heads/main"
    }}
  }]
}
```

Role permissions (the checked-in `infra/aws/github-ecr-publish-policy.json` and `github-oidc-trust.json` contain the exact scoped account/repository values):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "ecr:GetAuthorizationToken",
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "ecr:BatchCheckLayerAvailability", "ecr:InitiateLayerUpload",
        "ecr:UploadLayerPart", "ecr:CompleteLayerUpload", "ecr:PutImage",
        "ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer"
      ],
      "Resource": [
        "arn:aws:ecr:REGION:ACCOUNT_ID:repository/syncspace"
      ]
    }
  ]
}
```

The administrator provisioning IAM/ECR needs separate setup permissions. The local user's denied ECR listing does not establish whether a future OIDC publishing role can push.

## EC2 runtime deployment

ECR stores the images; the enabled `deploy-ec2.yml` workflow performs rollout to `i-07ba7b7856115e939` (`3.109.56.36`). SSM is connected after attaching the instance profile and restarting its agent. The separate GitHub deployment role is scoped to that instance and command document. Runtime secrets stay on the host, not in SSM command text. No local IAM-user permissions or security-group rules were changed.

The rollout uses a matched API/web digest pair, runs the API image's `npm run migrate` as a one-shot job with database access, stops on migration failure, updates services, waits for health, and supports returning to previous image digests. Database changes require compatible forward migrations; rolling back an image does not undo SQL. Runtime secrets belong in the target's secret store, never in image build arguments.

The existing web image uses Vite preview and `API_PROXY_TARGET` for HTTP/WebSocket proxying. Production TLS, hostname handling, API discovery, network boundaries, PostgreSQL/Redis connectivity, secure cookies and proxy trust must be configured and tested for the chosen runtime. This task does not claim that publishing the current local-runtime images makes the application production-ready. ARM64 targets require changing/building the image platforms.

## Verification and troubleshooting

- Run `actionlint .github/workflows/ci-ecr.yml` to check Actions syntax/expressions.
- A failed application check blocks publishing. Missing repository variables fail before AWS login.
- OIDC denial: verify provider, audience, account/role and exact repository/branch subject.
- ECR denial or repository-not-found: verify role policy, region and repository names; repositories must already exist.
- A successful publication must show both image digests in GitHub and the matching ECR tags. Consult the tracker for the latest observed remote run.
- CI covers application unit/integration tests, builds and deployment failure-path tests. The existing multi-container browser suite is not wired into this workflow.

References: [GitHub OIDC with AWS](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws), [AWS ECR login action](https://github.com/aws-actions/amazon-ecr-login), [Docker build/push action](https://github.com/docker/build-push-action).

## EC2 preflight

Target: `i-07ba7b7856115e939`, no domain yet. `ec2-preflight.yml` can be manually dispatched on `main` to inspect instance state, architecture, public IP, instance profile, SSM connectivity, Docker availability and running container names/ports. It does not read environment files or deploy anything. `AWS_EC2_DEPLOY_ROLE_ARN` selects the separate instance-scoped role `arn:aws:iam::190706546302:role/SyncSpaceGitHubEc2Deploy`; its exact policy is under `infra/aws/github-ec2-deploy-policy.json`. An SSM-managed instance and appropriate host networking/instance permissions are prerequisites. SSM/SSH access and host inspection are now verified; rollout execution evidence is recorded in the tracker.

The inspected instance is a running x86_64 `t3.micro`, public IP `3.109.56.36`, initially without a profile or SSM connection. `ec2-bootstrap.yml` attaches the prepared `SyncSpaceEc2Instance` profile only if no profile exists, then waits up to five minutes for SSM. It does not replace another profile, install packages or deploy the application. SSM agent installation/running state and outbound HTTPS access must still work. The instance profile grants SSM management and read-only access to this ECR repository.

## EC2 rollout automation

`deploy-ec2.yml` follows successful CI/ECR runs when `EC2_DEPLOY_ENABLED=true`; manual dispatch takes a successful publishing run ID for deployment/rollback. It validates the source workflow, repository, main branch, event and conclusion before checking out that commit. Automatic queued runs skip if a newer successful release exists. A concurrency group and host file lock serialize deployments. Only publishing runs made after these deployment files were added are eligible for manual rollout.

`scripts/deploy-ec2-command.py` resolves both component tags to ECR digests, packages the small deployment files from the verified commit and sends them through SSM. Its commands contain source files and image references, never runtime secrets. It waits for the SSM command result and fails on timeout/error; inspect an outstanding command before retrying after a timeout.

`scripts/deploy-ec2.sh` runs as root under `/opt/syncspace/releases/<commit>`. The first run generates database/Redis/JWT secrets in `/opt/syncspace/.env` (0600); later runs preserve them. It authenticates to ECR using the instance profile, pulls the digest-pinned images, starts/checks PostgreSQL and Redis, and applies migrations as a separate one-shot container. Migration failure prevents API/web replacement. It then starts the new API/web images and checks readiness through the web proxy. Failed health checks restore the previous API/web image/configuration pair when available and still fail the workflow; SQL migrations are never reversed automatically. Forward/backward schema compatibility is required for image rollback.

`deploy/compose.ec2.yml` is separate from local Compose. It runs one API, one web service, PostgreSQL 17 and Redis 7.4 on the selected 1 GB `t3.micro`. Only HTTP port 80 is published; SQL/Redis/API ports stay private to Docker. The named PostgreSQL volume persists across releases, logs rotate, and container memory limits bound usage. This small single-host setup has deployment interruptions and a single point of failure. Backups, HTTPS/domain, load testing and high availability remain outstanding. Public HTTP means browser traffic is not encrypted; do not treat it as a production-secure endpoint. The existing Vite preview server remains in use.

Release records: `.images.env` and `.current-release`; previous records: `.previous-images.env` and `.previous-release` under `/opt/syncspace`. Secrets must not be copied into GitHub or logs. The deploy role additionally has repository-scoped `ecr:DescribeImages` so it can resolve published tags; the instance role only pulls images. Host prerequisites: Docker, Compose, Python 3, AWS CLI, curl, flock, reachable SSM and an instance profile.

Host setup observed: Amazon Linux 2023, no pre-existing Docker/application installation; Docker 25.0.14 installed with dnf, Compose v5.8.0 installed from the official release after checksum verification. Restarting the existing SSM agent refreshed instance-profile credentials; preflight run `44695886390` passed. The local SSH key was used only from its existing local path and never uploaded to GitHub.

## Verified release

- API: `190706546302.dkr.ecr.ap-south-1.amazonaws.com/syncspace@sha256:0ad3ad82de93a1b7d7f77c58ad3b5fd5da2e93572c5b9f39fd1c23a8f9eb34e1`
- Web: `190706546302.dkr.ecr.ap-south-1.amazonaws.com/syncspace@sha256:a32c1c6780e0e0b5bc7c7aacb65f314f51cfd6876c54dd52706ecedf0bdc9f14`
- `EC2_DEPLOY_ENABLED=true` and `AWS_EC2_DEPLOY_ROLE_ARN` are configured in GitHub. Pushes to `main` now run checks, publish both images and automatically deploy.
- All four containers were healthy; public `/api/health/ready` reports PostgreSQL and Redis up. The live smoke test checked registration/login, workspace/project/task creation, WebSocket board updates and persisted chat. Its workspace and temporary account were removed.
- Docker client reported 25.0.14; server inspection reported 25.0.18. Compose is 5.8.0. No live rollback or database-restore drill was performed.
