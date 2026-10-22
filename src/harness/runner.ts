/**
 * Sentinel MCP Compliance Evaluation Harness
 * Automates testing of compliance verification tools by connecting to the MCP server via stdio,
 * executing test cases from cases.json, computing decision outcomes, and saving run telemetry to PostgreSQL.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { pool } from '../db/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test case structure loaded from cases.json
interface TestCase {
  id: string;
  entity_name: string;
  country_code: string;
  jurisdiction: string;
  registration_number: string;
  expected_status: 'APPROVED' | 'REJECTED' | 'MANUAL_REVIEW';
  description?: string;
}

// Result summary row for console reporting table
interface SummaryRow {
  'Case Name': string;
  Expected: string;
  Actual: string;
  Status: string;
  'Latency (ms)': number;
}

/**
 * Extracts and parses the text payload returned from an MCP tool response envelope.
 */
function parseToolText(toolResult: any): any {
  if (toolResult?.content && Array.isArray(toolResult.content)) {
    for (const item of toolResult.content) {
      if (item.type === 'text' && item.text) {
        try {
          return JSON.parse(item.text);
        } catch {
          return item.text;
        }
      }
    }
  }
  return toolResult;
}

/**
 * Main evaluation orchestrator:
 * Spawns the MCP server child process, iterates test cases, applies decision rules, and records results.
 */
async function runEvaluation() {
  console.log('Starting Sentinel MCP Compliance Evaluation Harness...\n');

  // 1. Load test cases from cases.json
  const casesPath = path.resolve(__dirname, 'cases.json');
  const rawCases = fs.readFileSync(casesPath, 'utf-8');
  const testCases: TestCase[] = JSON.parse(rawCases);

  // 2. Initialize MCP client connected to complianceServer.ts via stdio child process
  const serverPath = path.resolve(__dirname, '../mcp/complianceServer.ts');
  const transport = new StdioClientTransport({
    command: 'npx',
    args: ['tsx', serverPath],
    stderr: 'inherit',
  });

  const client = new Client(
    {
      name: 'sentinel-harness-runner',
      version: '1.0.0',
    },
    {
      capabilities: {},
    }
  );

  console.log('Connecting client to MCP server via stdio transport...');
  await client.connect(transport);
  console.log('Connected to MCP server.\n');

  const summaryRows: SummaryRow[] = [];
  let allPassed = true;

  // 3. Iterate and evaluate each test case
  for (const tc of testCases) {
    const startTime = Date.now();
    let passed = false;
    let actualStatus: 'APPROVED' | 'REJECTED' | 'MANUAL_REVIEW' = 'APPROVED';
    let failureReason: string | null = null;
    let riskScore = 0.0;

    try {
      // 3a. Upsert case record in compliance_cases table
      await pool.query(
        `INSERT INTO compliance_cases (id, entity_name, country_code, jurisdiction, status, risk_score)
         VALUES ($1, $2, $3, $4, 'PENDING', 0.0)
         ON CONFLICT (id) DO UPDATE SET
           entity_name = EXCLUDED.entity_name,
           country_code = EXCLUDED.country_code,
           jurisdiction = EXCLUDED.jurisdiction;`,
        [tc.id, tc.entity_name, tc.country_code, tc.jurisdiction]
      );

      // 3b. Query MCP verify_business_registry tool
      const registryResultRaw = await client.callTool({
        name: 'verify_business_registry',
        arguments: {
          registration_number: tc.registration_number,
          jurisdiction: tc.jurisdiction,
        },
      });
      const registryData = parseToolText(registryResultRaw);

      // 3c. Query MCP screen_sanctions tool
      const sanctionsResultRaw = await client.callTool({
        name: 'screen_sanctions',
        arguments: {
          name: tc.entity_name,
          country_code: tc.country_code,
        },
      });
      const sanctionsData = parseToolText(sanctionsResultRaw);

      // 3d. Compute compliance decision based on watchlist matches and registry standing
      const isSanctionsMatched = Boolean(
        sanctionsData?.matched === true || (sanctionsData?.risk_score && sanctionsData.risk_score >= 0.9)
      );
      riskScore = sanctionsData?.risk_score ?? (isSanctionsMatched ? 0.95 : 0.0);

      const registryStatus = registryData?.status;
      const isInactiveOrDissolved =
        registryStatus === 'DISSOLVED' || registryStatus === 'NOT_FOUND' || registryStatus !== 'ACTIVE';

      if (isSanctionsMatched) {
        actualStatus = 'REJECTED';
      } else if (isInactiveOrDissolved) {
        actualStatus = 'MANUAL_REVIEW';
      } else {
        actualStatus = 'APPROVED';
      }

      // 3e. Validate actual decision against the expected test vector status
      passed = actualStatus === tc.expected_status;
      if (!passed) {
        failureReason = `Expected status '${tc.expected_status}', got '${actualStatus}'`;
        allPassed = false;
      }

      // 3f. Update compliance_cases with evaluated status and risk score
      await pool.query(
        `UPDATE compliance_cases
         SET status = $1, risk_score = $2
         WHERE id = $3;`,
        [actualStatus, riskScore, tc.id]
      );
    } catch (err: any) {
      passed = false;
      failureReason = `Execution error: ${err.message}`;
      allPassed = false;
    }

    const latencyMs = Date.now() - startTime;

    // 3g. Persist execution outcome and telemetry into harness_eval_runs table
    await pool.query(
      `INSERT INTO harness_eval_runs (case_id, model_name, passed, failure_reason, tokens_used, latency_ms)
       VALUES ($1, $2, $3, $4, $5, $6);`,
      [tc.id, 'sentinel-rule-evaluator-v1', passed, failureReason, 0, latencyMs]
    );

    summaryRows.push({
      'Case Name': tc.entity_name,
      Expected: tc.expected_status,
      Actual: actualStatus,
      Status: passed ? 'PASS' : 'FAIL',
      'Latency (ms)': latencyMs,
    });
  }

  // 4. Output evaluation summary table to stdout
  console.log('=== HARNESS EVALUATION RESULTS ===\n');
  console.table(summaryRows);

  console.log(`\nEvaluation completed. Result: ${allPassed ? 'ALL PASSED (8/8)' : 'SOME FAILED'}`);

  // 5. Clean up open connections
  await client.close();
  await pool.end();

  if (!allPassed) {
    process.exit(1);
  }
}

// Execute harness and handle uncaught errors
runEvaluation().catch(async (error) => {
  console.error('Fatal harness error:', error);
  await pool.end().catch(() => {});
  process.exit(1);
});

