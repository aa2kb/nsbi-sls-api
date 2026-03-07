#!/usr/bin/env node

/**
 * Validates that the deployment stage is one of the allowed values
 * Allowed stages: dev, prod
 */

const ALLOWED_STAGES = ['dev', 'prod'];
const DEFAULT_STAGE = 'dev';

const args = process.argv.slice(2);
const stageArg = args.find(arg => arg.startsWith('--stage='));
const stage = stageArg ? stageArg.split('=')[1] : process.env.STAGE || DEFAULT_STAGE;

if (!ALLOWED_STAGES.includes(stage)) {
  console.error(`❌ Error: Invalid stage "${stage}"`);
  console.error(`✅ Allowed stages: ${ALLOWED_STAGES.join(', ')}`);
  process.exit(1);
}

console.log(`✅ Stage validation passed: "${stage}"`);
process.exit(0);
