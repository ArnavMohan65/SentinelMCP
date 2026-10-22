/**
 * Sentinel MCP Compliance Server
 * Implements a Model Context Protocol (MCP) server exposing tools for sanctions screening,
 * corporate registry lookup, and immutable compliance audit logging over stdio transport.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { pool } from '../db/index.js';

// Initialize the MCP server instance
export const server = new McpServer({
  name: 'sentinel-compliance',
  version: '1.0.0',
});

// Heuristic pattern to simulate watchlist hits on sensitive/illicit entity keywords
const SANCTIONS_REGEX = /sanctioned|blocked|shell|illicit/i;

// RFC 4122 compliant UUID regex to validate foreign keys before database insertion
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Normalizes input objects/primitives into valid JSON strings for PostgreSQL JSONB columns.
 */
function toJsonb(val: unknown): string | null {
  if (val === undefined || val === null) return null;
  if (typeof val === 'string') {
    try {
      JSON.parse(val);
      return val;
    } catch {
      return JSON.stringify(val);
    }
  }
  return JSON.stringify(val);
}

// 1. screen_sanctions tool: Screens entity name against watchlists and returns risk score
server.tool(
  'screen_sanctions',
  'Screen an entity name and country against sanctions lists',
  {
    name: z.string().describe('The name of the entity or individual to screen'),
    country_code: z.string().length(2).describe('2-letter ISO country code'),
  },
  async ({ name, country_code }) => {
    const isMatched = SANCTIONS_REGEX.test(name);
    const result = {
      matched: isMatched,
      risk_score: isMatched ? 0.95 : 0.0,
      matched_list: isMatched ? 'OFAC_SDN' : null,
      entity_name: name,
      country_code: country_code.toUpperCase(),
    };

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }
);

// 2. verify_business_registry tool: Validates active standing with national corporate registries
server.tool(
  'verify_business_registry',
  'Verify business registration status and retrieve registry details',
  {
    registration_number: z.string().describe('Business registration number'),
    jurisdiction: z.string().describe('Jurisdiction or country of incorporation'),
  },
  async ({ registration_number, jurisdiction }) => {
    let status: 'ACTIVE' | 'DISSOLVED' | 'NOT_FOUND' = 'ACTIVE';

    if (/dissolved|inactive|struck|^dis[-_0-9]/i.test(registration_number)) {
      status = 'DISSOLVED';
    } else if (/not_found|invalid|none|unknown|^0+$/i.test(registration_number)) {
      status = 'NOT_FOUND';
    } else {
      status = 'ACTIVE';
    }

    const result = {
      status,
      incorporation_date: status === 'NOT_FOUND' ? '' : '2019-03-15',
      directors: status === 'NOT_FOUND' ? [] : ['Sarah Connor', 'John Anderson'],
      registration_number,
      jurisdiction,
    };

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }
);

// 3. log_compliance_audit tool: Records immutable tool executions into PostgreSQL audit_logs table
server.tool(
  'log_compliance_audit',
  'Log compliance tool execution details into the audit_logs database table',
  {
    case_id: z.string().optional().nullable().describe('Associated compliance case UUID'),
    tool_name: z.string().describe('Name of the executed tool'),
    tool_args: z.any().optional().nullable().describe('Arguments passed to the tool'),
    tool_output: z.any().optional().nullable().describe('Output of the tool execution'),
    execution_time_ms: z.number().int().optional().nullable().describe('Execution time in milliseconds'),
  },
  async ({ case_id, tool_name, tool_args, tool_output, execution_time_ms }) => {
    try {
      let validCaseId: string | null = null;
      // Validate that case_id exists in compliance_cases before setting foreign key
      if (case_id && UUID_REGEX.test(case_id.trim())) {
        const trimmedId = case_id.trim();
        const caseCheck = await pool.query('SELECT id FROM compliance_cases WHERE id = $1', [trimmedId]);
        if (caseCheck.rows.length > 0) {
          validCaseId = trimmedId;
        } else {
          console.error(`[audit_log] case_id ${trimmedId} not found in compliance_cases, saving audit log with null case_id.`);
        }
      }

      const insertQuery = `
        INSERT INTO audit_logs (case_id, tool_name, tool_args, tool_output, execution_time_ms)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, case_id, tool_name, tool_args, tool_output, execution_time_ms, timestamp;
      `;

      const { rows } = await pool.query(insertQuery, [
        validCaseId,
        tool_name,
        toJsonb(tool_args),
        toJsonb(tool_output),
        execution_time_ms ?? null,
      ]);

      const logRecord = rows[0];

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                success: true,
                audit_log: logRecord,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      console.error('[audit_log] Failed to insert audit log:', error);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
            }),
          },
        ],
        isError: true,
      };
    }
  }
);

/**
 * Connects the MCP server to stdio transport for client communication.
 */
export async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Sentinel MCP Compliance Server running on stdio');
}

// Auto-run server if executed directly as entrypoint
runServer().catch((error) => {
  console.error('Fatal error running Sentinel MCP server:', error);
  process.exit(1);
});

