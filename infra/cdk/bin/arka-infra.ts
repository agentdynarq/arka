#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { ArkaStack } from '../lib/stacks/arka-stack';

/**
 * Arka Phase 3 CDK application entry point.
 *
 * All configuration is read from cdk.json context values.
 * Before deploying:
 *   1. Set operatorIp in cdk.json to your public IP with /32 suffix
 *   2. Ensure the key pair "arkakeypair" exists in the target region
 *   3. Run: cdk bootstrap aws://<ACCOUNT_ID>/ap-south-1
 *   4. Run: cdk deploy
 *
 * To add Cell 3 for the live demo:
 *   1. Add "cell-3": { "vpcCidr": "10.3.0.0/16" } to the cells map in cdk.json
 *   2. Run: cdk deploy
 */
const app = new cdk.App();

// Read all configuration from context (cdk.json)
const awsRegion = app.node.tryGetContext('awsRegion') as string;
const operatorIp = app.node.tryGetContext('operatorIp') as string;
const keyName = app.node.tryGetContext('keyName') as string;
const instanceType = app.node.tryGetContext('instanceType') as string;
const controlPlane = app.node.tryGetContext('controlPlane') as { vpcCidr: string };
const cells = app.node.tryGetContext('cells') as Record<string, { vpcCidr: string }>;

new ArkaStack(app, 'ArkaStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: awsRegion || process.env.CDK_DEFAULT_REGION,
  },
  description: 'Arka Phase 3 Tier 0: control plane + cell-isolated VPCs (Duothan 6.0)',
  operatorIp,
  keyName,
  instanceType,
  controlPlaneVpcCidr: controlPlane.vpcCidr,
  cells,
});

app.synth();
