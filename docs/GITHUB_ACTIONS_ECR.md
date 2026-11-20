# GitHub Actions and AWS ECR

Status (2026-11-20): workflow locally verified; remote execution/publishing evidence is recorded in `IMPLEMENTATION_TRACKER.md`. Runtime deployment awaits the target service details. GitHub authentication and admin access to `balumurugan107/SyncSpace` are verified. The AWS CLI identity authenticates in account `190706546302`, default region `ap-south-1`, but cannot call `ecr:DescribeRepositories`. The GitHub OIDC provider has been created; publishing role setup is recorded in the tracker.

## Workflow

`.github/workflows/ci-ecr.yml` runs frontend tests/build (including TypeScript) and backend typecheck/tests/build on pull requests, pushes to `main`, and manual dispatch. Backend tests migrate a disposable PostgreSQL 17 test database and use Redis 7.4 database 1. No application `.env` is required in CI; the database password in the workflow is only for the ephemeral CI service.

After both check jobs succeed, pushes/manual runs on `main` publish the existing backend and frontend Dockerfiles as separate `linux/amd64` images. The API image also runs migrations. PRs and manual runs on other branches cannot publish. All action references are pinned to upstream commit SHAs. Docker build contexts exclude `.env` and `.env.*` except the example file.

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

Trust policy (standard AWS partition):

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {"Federated": "arn:aws:iam::ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com"},
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {"StringEquals": {
      "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
      "token.actions.githubusercontent.com:sub": "repo:OWNER/REPOSITORY:ref:refs/heads/main"
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

## Runtime deployment still required

ECR stores images; publishing does not start or update the application. Supply the runtime target (ECS/Fargate, EC2, Kubernetes, etc.) and its identifiers before adding a rollout job. The workflow currently ends after publication. It does not deploy the database or execute production migrations.

The rollout must use a matched API/web digest pair, run the API image's `npm run migrate` as a one-shot job with database access, stop on migration failure, update services, wait for health, and support returning to previous image digests. Database changes require compatible forward migrations; rolling back an image does not undo SQL. Runtime secrets belong in the target's secret store, never in image build arguments.

The existing web image uses Vite preview and `API_PROXY_TARGET` for HTTP/WebSocket proxying. Production TLS, hostname handling, API discovery, network boundaries, PostgreSQL/Redis connectivity, secure cookies and proxy trust must be configured and tested for the chosen runtime. This task does not claim that publishing the current local-runtime images makes the application production-ready. ARM64 targets require changing/building the image platforms.

## Verification and troubleshooting

- Run `actionlint .github/workflows/ci-ecr.yml` to check Actions syntax/expressions.
- A failed application check blocks publishing. Missing repository variables fail before AWS login.
- OIDC denial: verify provider, audience, account/role and exact repository/branch subject.
- ECR denial or repository-not-found: verify role policy, region and repository names; repositories must already exist.
- A successful publication must show both image digests in GitHub and the matching ECR tags. Consult the tracker for the latest observed remote run.
- CI currently covers unit/integration tests and application builds. The existing multi-container browser suite is not wired into this workflow.

References: [GitHub OIDC with AWS](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws), [AWS ECR login action](https://github.com/aws-actions/amazon-ecr-login), [Docker build/push action](https://github.com/docker/build-push-action).
