import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import { Construct } from 'constructs';

/**
 * Props for the GitHub OIDC construct.
 */
export interface GitHubOidcProps {
  /**
   * GitHub repository in "owner/repo" format.
   * The trust policy restricts AssumeRole to this repo only.
   */
  readonly repository: string;

  /**
   * The ECR repository the release pipeline pushes images to.
   * The role is granted push access scoped to this repository.
   */
  readonly ecrRepository: ecr.IRepository;

  /**
   * The EC2 instance ARNs the release pipeline may target with
   * ssm:SendCommand. Scoped to exactly these instances, never "*".
   */
  readonly instanceArns: string[];
}

/**
 * Creates an IAM OIDC identity provider for GitHub Actions and a
 * least-privilege release role that the workflow assumes with no
 * long-lived access key.
 *
 * The role grants only what the release pipeline (.github/workflows/deploy.yml)
 * needs:
 * - Push the application image to the "arka" ECR repository.
 * - Run the release on each host over Systems Manager, scoped to our
 *   instances and the AWS-RunShellScript document.
 *
 * No AdministratorAccess. No CloudFormation, EC2, or IAM management: the
 * infrastructure is provisioned separately by an operator running cdk deploy,
 * not by this pipeline.
 */
export class GitHubOidcConstruct extends Construct {
  /** The IAM role ARN that GitHub Actions assumes. */
  public readonly roleArn: string;

  constructor(scope: Construct, id: string, props: GitHubOidcProps) {
    super(scope, id);

    // -----------------------------------------------------------------
    // OIDC Provider
    // GitHub's OIDC provider issues tokens that AWS STS can verify.
    // Created once per account; audience is sts.amazonaws.com.
    // -----------------------------------------------------------------
    const provider = new iam.OpenIdConnectProvider(this, 'GitHubProvider', {
      url: 'https://token.actions.githubusercontent.com',
      clientIds: ['sts.amazonaws.com'],
      // GitHub's TLS thumbprint for token.actions.githubusercontent.com.
      thumbprints: ['6938fd4d98bab03faadb97b34396831e3780aea1'],
    });

    // -----------------------------------------------------------------
    // IAM Role for GitHub Actions
    // Trust policy: only the specified repository can assume this role.
    // The "sub" claim is scoped to repo:<owner>/<repo>:*, which is the
    // one repository across all its refs, never a wildcard across every
    // repository. The audience is pinned to sts.amazonaws.com.
    // -----------------------------------------------------------------
    const deployRole = new iam.Role(this, 'DeployRole', {
      roleName: 'arka-github-deploy',
      assumedBy: new iam.FederatedPrincipal(
        provider.openIdConnectProviderArn,
        {
          StringLike: {
            'token.actions.githubusercontent.com:sub': `repo:${props.repository}:*`,
          },
          StringEquals: {
            'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
          },
        },
        'sts:AssumeRoleWithWebIdentity',
      ),
      description: 'Least-privilege role for the Arka GitHub Actions release pipeline',
      maxSessionDuration: cdk.Duration.hours(1),
    });

    // -----------------------------------------------------------------
    // ECR: obtain an auth token (account-level, cannot be resource
    // scoped) and push image layers to the arka repository only.
    // -----------------------------------------------------------------
    deployRole.addToPolicy(new iam.PolicyStatement({
      sid: 'EcrAuth',
      effect: iam.Effect.ALLOW,
      actions: ['ecr:GetAuthorizationToken'],
      resources: ['*'],
    }));

    deployRole.addToPolicy(new iam.PolicyStatement({
      sid: 'EcrPush',
      effect: iam.Effect.ALLOW,
      actions: [
        'ecr:BatchCheckLayerAvailability',
        'ecr:InitiateLayerUpload',
        'ecr:UploadLayerPart',
        'ecr:CompleteLayerUpload',
        'ecr:PutImage',
        'ecr:BatchGetImage',
      ],
      resources: [props.ecrRepository.repositoryArn],
    }));

    // -----------------------------------------------------------------
    // SSM: run the release on each host. SendCommand is scoped to
    // exactly our instances and the AWS-RunShellScript document, never
    // "*". Reading command results is not resource-scopeable, so those
    // read-only actions are unscoped.
    // -----------------------------------------------------------------
    const runShellScriptArn = cdk.Stack.of(this).formatArn({
      service: 'ssm',
      account: '',
      resource: 'document',
      resourceName: 'AWS-RunShellScript',
    });

    deployRole.addToPolicy(new iam.PolicyStatement({
      sid: 'SsmSendCommand',
      effect: iam.Effect.ALLOW,
      actions: ['ssm:SendCommand'],
      resources: [...props.instanceArns, runShellScriptArn],
    }));

    deployRole.addToPolicy(new iam.PolicyStatement({
      sid: 'SsmReadCommandResult',
      effect: iam.Effect.ALLOW,
      actions: [
        'ssm:GetCommandInvocation',
        'ssm:ListCommandInvocations',
      ],
      resources: ['*'],
    }));

    this.roleArn = deployRole.roleArn;

    // -----------------------------------------------------------------
    // Stack Outputs
    // -----------------------------------------------------------------
    new cdk.CfnOutput(this, 'GitHubOidcRoleArn', {
      value: deployRole.roleArn,
      description: 'IAM role ARN for GitHub Actions to assume via OIDC',
    });
  }
}
