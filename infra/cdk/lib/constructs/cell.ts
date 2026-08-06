import * as fs from 'fs';
import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import { Construct } from 'constructs';

/**
 * Props for the Cell construct.
 *
 * A Cell is configuration, not code. This construct has zero conditionals
 * on cellId. If a Cell needs a special case in infrastructure, ADR 0001
 * has been violated and the defect is in the services, not the CDK.
 */
export interface CellProps {
  /**
   * Cell identifier, e.g. "cell-1".
   * Becomes the CELL_ID environment variable in the container runtime.
   * Used only for tagging and the /opt/arka/.cell-id marker file.
   */
  readonly cellId: string;

  /** VPC CIDR block, e.g. "10.1.0.0/16". Must not overlap another Cell. */
  readonly vpcCidr: string;

  /** EC2 instance type, e.g. "t3.small" */
  readonly instanceType: string;

  /** Name of a pre-existing EC2 key pair for SSH access */
  readonly keyName: string;

  /** Operator IP in CIDR notation for SSH access, e.g. "203.0.113.5/32" */
  readonly operatorIp: string;

  /**
   * Control plane's public Elastic IP address (e.g. "13.x.x.x").
   * Used to construct /32 SG ingress rules for Postgres (5432) and
   * Redis (6379), so the Recovery Console can reach Cell databases.
   * Also used for instance tagging.
   */
  readonly controlPlaneIp: string;

  /** Machine image to use for the EC2 instance (Ubuntu 24.04 LTS recommended) */
  readonly machineImage: ec2.IMachineImage;

  /**
   * The shared ECR repository the host pulls its application image from.
   * The instance role is granted pull access scoped to this repository.
   */
  readonly ecrRepository: ecr.IRepository;
}

/**
 * Cell infrastructure: VPC, security group, EIP, and EC2 instance.
 *
 * Each Cell is a completely isolated environment with its own VPC.
 * No peering connection, no transit gateway, no shared subnet, no shared
 * security group exists between any two Cells. This is stronger than subnet
 * isolation inside a shared VPC, because VPC isolation cannot be
 * misconfigured with a single security group rule change.
 *
 * The construct is instantiated once per Cell with different props.
 * Adding a Cell is adding a config entry in cdk.json, not writing code.
 *
 * See PHASE-3-ARCHITECTURE.md sections 1 and 4.
 */
export class CellConstruct extends Construct {
  /** The Elastic IP for this Cell's public-facing address. */
  public readonly eip: ec2.CfnEIP;

  /** The EC2 instance running this Cell's services. */
  public readonly instance: ec2.Instance;

  /** The dedicated VPC for this Cell. */
  public readonly vpc: ec2.Vpc;

  /** The security group governing this Cell's traffic. */
  public readonly securityGroup: ec2.SecurityGroup;

  /** The IAM role attached to the instance via its instance profile. */
  public readonly instanceRole: iam.Role;

  /** The Cell identifier passed through from props. */
  public readonly cellId: string;

  constructor(scope: Construct, id: string, props: CellProps) {
    super(scope, id);

    this.cellId = props.cellId;

    // -----------------------------------------------------------------
    // VPC: dedicated per Cell. No peering, no TGW, no shared resources.
    // The dotted line in the architecture diagram is the point:
    // Cell 1 and Cell 2 have no AWS object that could carry traffic
    // between them.
    // -----------------------------------------------------------------
    this.vpc = new ec2.Vpc(this, 'Vpc', {
      ipAddresses: ec2.IpAddresses.cidr(props.vpcCidr),
      maxAzs: 1,
      natGateways: 0,
      subnetConfiguration: [
        {
          name: `arka-${props.cellId}-public`,
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
      ],
    });

    // -----------------------------------------------------------------
    // Security Group
    // Inbound: 80, 443 from anywhere (customers browse their own Cell).
    //          22 from operator IP only.
    //          5432, 6379 from control plane EIP only (Recovery Console
    //          connects directly to Cell Postgres and Redis for health
    //          checks and ledger integrity audits).
    // Outbound: all (Docker Hub, apt, Let's Encrypt).
    // -----------------------------------------------------------------
    this.securityGroup = new ec2.SecurityGroup(this, 'SG', {
      vpc: this.vpc,
      description: `Arka ${props.cellId}: 80/443 public, 22 operator-only, DB from control only`,
      allowAllOutbound: true,
    });

    this.securityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      'HTTP for Caddy ACME challenge and redirect',
    );

    this.securityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      'HTTPS: customers access their Cell directly',
    );

    this.securityGroup.addIngressRule(
      ec2.Peer.ipv4(props.operatorIp),
      ec2.Port.tcp(22),
      'SSH from operator IP only',
    );

    // controlPlaneIp is a CloudFormation token (not yet resolved at synth).
    // Construct the /32 CIDR using Fn.join so CloudFormation resolves it.
    const controlCidr = cdk.Fn.join('', [props.controlPlaneIp, '/32']);

    this.securityGroup.addIngressRule(
      ec2.Peer.ipv4(controlCidr as unknown as string),
      ec2.Port.tcp(5432),
      'Postgres: control plane Recovery Console direct DB access',
    );

    this.securityGroup.addIngressRule(
      ec2.Peer.ipv4(controlCidr as unknown as string),
      ec2.Port.tcp(6379),
      'Redis: control plane Recovery Console direct DB access',
    );

    // -----------------------------------------------------------------
    // Instance role and profile
    // The release pipeline reaches this host over AWS Systems Manager, not
    // SSH, so a release needs no inbound port and no private key. SSM needs
    // AmazonSSMManagedInstanceCore. The host also pulls its application
    // image from the shared ECR repository, so grant pull scoped to it.
    // Passing a role to ec2.Instance creates the instance profile.
    // -----------------------------------------------------------------
    this.instanceRole = new iam.Role(this, 'InstanceRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      description: `Arka ${props.cellId} host: SSM managed + ECR pull`,
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
      ],
    });
    props.ecrRepository.grantPull(this.instanceRole);

    // -----------------------------------------------------------------
    // EC2 Instance
    // - IMDSv2 enforced: prevents SSRF-based metadata credential theft
    // - EBS root volume: 8GB gp3, encrypted at rest
    // - UserData: sets CELL_ID, installs Docker, hardens SSH, enables UFW
    // -----------------------------------------------------------------
    this.instance = new ec2.Instance(this, 'Instance', {
      vpc: this.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      instanceType: new ec2.InstanceType(props.instanceType),
      machineImage: props.machineImage,
      securityGroup: this.securityGroup,
      role: this.instanceRole,
      keyPair: ec2.KeyPair.fromKeyPairName(this, 'KeyPair', props.keyName),
      requireImdsv2: true,
      blockDevices: [
        {
          deviceName: '/dev/sda1',
          volume: ec2.BlockDeviceVolume.ebs(8, {
            volumeType: ec2.EbsDeviceVolumeType.GP3,
            encrypted: true,
          }),
        },
      ],
    });

    // Inject CELL_ID and the control plane IP as shell variables before the
    // cloud-init script body. cell-init.sh references ${CELL_ID} for the
    // marker file and ${CONTROL_PLANE_IP} for the DB port firewall rules.
    this.instance.addUserData(`export CELL_ID="${props.cellId}"`);
    this.instance.addUserData(`export CONTROL_PLANE_IP="${props.controlPlaneIp}"`);

    const userDataScript = fs.readFileSync(
      path.join(__dirname, '..', 'user-data', 'cell-init.sh'),
      'utf8',
    );
    this.instance.addUserData(userDataScript);

    // Tag the instance for easy identification
    cdk.Tags.of(this.instance).add('Name', `arka-${props.cellId}`);
    cdk.Tags.of(this.instance).add('Role', 'cell');
    cdk.Tags.of(this.instance).add('CellId', props.cellId);
    cdk.Tags.of(this.instance).add('ControlPlaneIp', props.controlPlaneIp);

    // -----------------------------------------------------------------
    // Elastic IP: stable public address for nip.io DNS.
    // -----------------------------------------------------------------
    this.eip = new ec2.CfnEIP(this, 'EIP', {
      domain: 'vpc',
      tags: [{ key: 'Name', value: `arka-${props.cellId}-eip` }],
    });

    new ec2.CfnEIPAssociation(this, 'EIPAssoc', {
      allocationId: this.eip.attrAllocationId,
      instanceId: this.instance.instanceId,
    });
  }
}
