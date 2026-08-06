import * as fs from 'fs';
import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import { Construct } from 'constructs';

/**
 * Props for the control plane construct.
 * The control plane runs: console, gateway, recovery, control Postgres.
 */
export interface ControlPlaneProps {
  /** VPC CIDR block, e.g. "10.10.0.0/16" */
  readonly vpcCidr: string;

  /** EC2 instance type, e.g. "t3.small" */
  readonly instanceType: string;

  /** Name of a pre-existing EC2 key pair for SSH access */
  readonly keyName: string;

  /** Operator IP in CIDR notation for SSH access, e.g. "203.0.113.5/32" */
  readonly operatorIp: string;

  /** Machine image to use for the EC2 instance (Ubuntu 24.04 LTS recommended) */
  readonly machineImage: ec2.IMachineImage;

  /**
   * The shared ECR repository the host pulls its application image from.
   * The instance role is granted pull access scoped to this repository.
   */
  readonly ecrRepository: ecr.IRepository;
}

/**
 * Control plane infrastructure: VPC, security group, EIP, and EC2 instance.
 *
 * The control plane is the only component aware that multiple Cells exist.
 * It reaches Cells over HTTPS (port 443 on the public internet), authenticated
 * by workload tokens, restricted by the Cell's security group to the control
 * plane's EIP.
 *
 * See PHASE-3-ARCHITECTURE.md section 2 for the full topology.
 */
export class ControlPlaneConstruct extends Construct {
  /** The Elastic IP resource (CfnEIP) for stable addressing. */
  public readonly eip: ec2.CfnEIP;

  /** The EC2 instance running the control plane services. */
  public readonly instance: ec2.Instance;

  /** The dedicated VPC for the control plane (10.10.0.0/16). */
  public readonly vpc: ec2.Vpc;

  /** The security group governing inbound/outbound traffic. */
  public readonly securityGroup: ec2.SecurityGroup;

  /** The IAM role attached to the instance via its instance profile. */
  public readonly instanceRole: iam.Role;

  constructor(scope: Construct, id: string, props: ControlPlaneProps) {
    super(scope, id);

    // -----------------------------------------------------------------
    // VPC: dedicated, no peering, no NAT (saves ~$32/month).
    // Single public subnet is sufficient for Tier 0.
    // -----------------------------------------------------------------
    this.vpc = new ec2.Vpc(this, 'Vpc', {
      ipAddresses: ec2.IpAddresses.cidr(props.vpcCidr),
      maxAzs: 1,
      natGateways: 0,
      subnetConfiguration: [
        {
          name: 'arka-control-public',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
      ],
    });

    // -----------------------------------------------------------------
    // Security Group
    // Inbound: 80, 443 from anywhere (Caddy serves HTTPS).
    //          22 from operator IP only.
    // Outbound: all (needed for apt, Docker Hub, Let's Encrypt).
    // -----------------------------------------------------------------
    this.securityGroup = new ec2.SecurityGroup(this, 'SG', {
      vpc: this.vpc,
      description: 'Arka control plane: 80/443 public, 22 operator-only',
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
      'HTTPS for all control plane services via Caddy',
    );

    this.securityGroup.addIngressRule(
      ec2.Peer.ipv4(props.operatorIp),
      ec2.Port.tcp(22),
      'SSH from operator IP only',
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
      description: 'Arka control plane host: SSM managed + ECR pull',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
      ],
    });
    props.ecrRepository.grantPull(this.instanceRole);

    // -----------------------------------------------------------------
    // EC2 Instance
    // - IMDSv2 enforced: prevents SSRF-based metadata credential theft
    // - EBS root volume: 8GB gp3, encrypted at rest with default KMS key
    // - UserData: installs Docker, Compose, Git; hardens SSH; enables UFW
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

    // Load and apply cloud-init script
    const userDataScript = fs.readFileSync(
      path.join(__dirname, '..', 'user-data', 'control-init.sh'),
      'utf8',
    );
    this.instance.addUserData(userDataScript);

    // Tag the instance for easy identification
    cdk.Tags.of(this.instance).add('Name', 'arka-control');
    cdk.Tags.of(this.instance).add('Role', 'control-plane');

    // -----------------------------------------------------------------
    // Elastic IP: stable public address for nip.io DNS and Cell SG refs.
    // Allocated separately from the instance so Cells can reference it
    // without a dependency cycle.
    // -----------------------------------------------------------------
    this.eip = new ec2.CfnEIP(this, 'EIP', {
      domain: 'vpc',
      tags: [{ key: 'Name', value: 'arka-control-eip' }],
    });

    new ec2.CfnEIPAssociation(this, 'EIPAssoc', {
      allocationId: this.eip.attrAllocationId,
      instanceId: this.instance.instanceId,
    });
  }
}
