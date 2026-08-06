import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import { Construct } from 'constructs';
import { ControlPlaneConstruct } from '../constructs/control-plane';
import { CellConstruct } from '../constructs/cell';
import { GitHubOidcConstruct } from '../constructs/github-oidc';

/**
 * Configuration for a single Cell, read from cdk.json context.
 */
interface CellConfig {
  readonly vpcCidr: string;
}

/**
 * Props for the main Arka stack.
 */
export interface ArkaStackProps extends cdk.StackProps {
  /** Operator IP in CIDR notation, e.g. "203.0.113.5/32" */
  readonly operatorIp: string;

  /** Pre-existing EC2 key pair name */
  readonly keyName: string;

  /** EC2 instance type for the control plane host (e.g. "t2.medium") */
  readonly controlInstanceType: string;

  /** EC2 instance type for each Cell host (e.g. "t2.small") */
  readonly cellInstanceType: string;

  /** Control plane VPC CIDR */
  readonly controlPlaneVpcCidr: string;

  /** Map of cell ID to cell configuration */
  readonly cells: Record<string, CellConfig>;

  /**
   * Optional machine image override. When omitted the stack resolves
   * Ubuntu 24.04 LTS via MachineImage.lookup(). Pass a generic image
   * in unit tests to avoid the AWS API call.
   */
  readonly machineImage?: ec2.IMachineImage;
}

/**
 * The single CloudFormation stack for the entire Arka Tier 0 deployment.
 *
 * Single stack because:
 * - Three VPCs with no cross-references (except the control EIP passed as a
 *   tag) deploy independently within CloudFormation.
 * - A single `cdk deploy` provisions everything.
 * - Adding cell-3 for the live demo means editing cdk.json and redeploying;
 *   CloudFormation handles the diff, adding only the new resources.
 *
 * The stack enforces the architecture's core invariant: no AWS object exists
 * that could carry traffic between Cells. Each Cell gets its own VPC and
 * the construct has zero conditionals on cell ID.
 */
export class ArkaStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ArkaStackProps) {
    super(scope, id, props);

    // -----------------------------------------------------------------
    // Validate inputs early
    // -----------------------------------------------------------------
    if (!props.operatorIp || props.operatorIp === 'REPLACE_WITH_YOUR_IP/32') {
      throw new Error(
        'operatorIp must be set in cdk.json context before deploying. ' +
        'Find your IP at https://checkip.amazonaws.com and add /32.',
      );
    }

    if (!props.cells || Object.keys(props.cells).length === 0) {
      throw new Error('At least one cell must be defined in the cells context.');
    }

    // -----------------------------------------------------------------
    // AMI: resolved once, shared across all constructs.
    // Tests inject a dummy via props.machineImage to skip AWS API calls.
    // -----------------------------------------------------------------
    const machineImage = props.machineImage ?? ec2.MachineImage.lookup({
      name: 'ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*',
      owners: ['099720109477'], // Canonical
    });

    // -----------------------------------------------------------------
    // ECR repository
    // The release pipeline builds the application image in GitHub Actions
    // and pushes it here; hosts pull it. One repository named "arka",
    // shared by control plane and every Cell (the image is the same, the
    // build args differ). Image scanning on push is enabled.
    // -----------------------------------------------------------------
    const ecrRepository = new ecr.Repository(this, 'Repo', {
      repositoryName: 'arka',
      imageScanOnPush: true,
    });

    // -----------------------------------------------------------------
    // Control Plane
    // Instantiated once. The EIP is allocated here and its address is
    // passed to Cell constructs so their SG can allow DB access from it.
    // -----------------------------------------------------------------
    const controlPlane = new ControlPlaneConstruct(this, 'Control', {
      vpcCidr: props.controlPlaneVpcCidr,
      instanceType: props.controlInstanceType,
      keyName: props.keyName,
      operatorIp: props.operatorIp,
      machineImage,
      ecrRepository,
    });

    // -----------------------------------------------------------------
    // Cells
    // Instantiated once per entry in the cells map.
    // No conditional on cellId anywhere. Adding a Cell is adding a
    // config entry, not writing code.
    // -----------------------------------------------------------------
    const cellConstructs: Record<string, CellConstruct> = {};

    for (const [cellId, cellConfig] of Object.entries(props.cells)) {
      const cell = new CellConstruct(this, `Cell-${cellId}`, {
        cellId,
        vpcCidr: cellConfig.vpcCidr,
        instanceType: props.cellInstanceType,
        keyName: props.keyName,
        operatorIp: props.operatorIp,
        controlPlaneIp: controlPlane.eip.attrPublicIp,
        machineImage,
        ecrRepository,
      });

      cellConstructs[cellId] = cell;
    }

    // -----------------------------------------------------------------
    // Stack Outputs
    // -----------------------------------------------------------------

    // Control plane outputs
    new cdk.CfnOutput(this, 'ControlPublicIp', {
      value: controlPlane.eip.attrPublicIp,
      description: 'Control plane Elastic IP (public)',
    });

    new cdk.CfnOutput(this, 'ControlPrivateIp', {
      value: controlPlane.instance.instancePrivateIp,
      description: 'Control plane private IP',
    });

    new cdk.CfnOutput(this, 'ControlHostname', {
      value: cdk.Fn.sub('arka.${ip}.nip.io', {
        ip: controlPlane.eip.attrPublicIp,
      }),
      description: 'Control plane nip.io hostname',
    });

    new cdk.CfnOutput(this, 'SshControl', {
      value: cdk.Fn.sub('ssh -i ${key}.pem ubuntu@${ip}', {
        key: props.keyName,
        ip: controlPlane.eip.attrPublicIp,
      }),
      description: 'SSH command for the control plane host',
    });

    // Per-cell outputs
    for (const [cellId, cell] of Object.entries(cellConstructs)) {
      const safeId = cellId.replace(/-/g, '');

      new cdk.CfnOutput(this, `${safeId}PublicIp`, {
        value: cell.eip.attrPublicIp,
        description: `${cellId} Elastic IP (public)`,
      });

      new cdk.CfnOutput(this, `${safeId}PrivateIp`, {
        value: cell.instance.instancePrivateIp,
        description: `${cellId} private IP`,
      });

      new cdk.CfnOutput(this, `${safeId}Hostname`, {
        value: cdk.Fn.sub('${cellId}.${ip}.nip.io', {
          cellId,
          ip: cell.eip.attrPublicIp,
        }),
        description: `${cellId} nip.io hostname`,
      });

      new cdk.CfnOutput(this, `Ssh${safeId}`, {
        value: cdk.Fn.sub('ssh -i ${key}.pem ubuntu@${ip}', {
          key: props.keyName,
          ip: cell.eip.attrPublicIp,
        }),
        description: `SSH command for the ${cellId} host`,
      });
    }

    // -----------------------------------------------------------------
    // GitHub OIDC for CI/CD
    // Creates an IAM OIDC provider and a least-privilege release role
    // restricted to the agentdynarq/arka repository. The role can push
    // to the ECR repository and run the release over SSM, scoped to
    // exactly these instances and the AWS-RunShellScript document.
    // -----------------------------------------------------------------
    const instanceArns = [
      controlPlane.instance,
      ...Object.values(cellConstructs).map((c) => c.instance),
    ].map((instance) =>
      this.formatArn({
        service: 'ec2',
        resource: 'instance',
        resourceName: instance.instanceId,
      }),
    );

    new GitHubOidcConstruct(this, 'GitHubOidc', {
      repository: 'agentdynarq/arka',
      ecrRepository,
      instanceArns,
    });

    // -----------------------------------------------------------------
    // Default tags applied to every resource in the stack
    // -----------------------------------------------------------------
    cdk.Tags.of(this).add('Project', 'arka');
    cdk.Tags.of(this).add('ManagedBy', 'cdk');
    cdk.Tags.of(this).add('Environment', 'tier-0');
  }
}
