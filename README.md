# SentinelMCP

A Model Context Protocol (MCP) server providing automated compliance, sanctions screening, corporate registry verification, and immutable audit logging backed by PostgreSQL.

---

## Features

- **Sanctions Screening (`screen_sanctions`)**: Evaluates entity names and ISO country codes against watchlist heuristics and risk scores.
- **Business Registry Verification (`verify_business_registry`)**: Validates business standing (`ACTIVE`, `DISSOLVED`, `NOT_FOUND`) and extracts corporate metadata.
- **Audit Logging (`log_compliance_audit`)**: Records tamper-evident tool executions into PostgreSQL `audit_logs` with JSONB payloads and execution metrics.
- **Evaluation Harness**: Automated evaluation runner for synthetic test cases and compliance pipeline verification.

---

## Prerequisites

- [Node.js](https://nodejs.org/) (v20+ recommended)
- [Docker](https://www.docker.com/) & Docker Compose

---

## Getting Started

### 1. Clone & Install Dependencies

```bash
git clone [<your-repo-url>](https://github.com/ArnavMohan65/SentinelMCP)
cd SentinelMCP
npm install
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Default configuration:
```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/sentinel_db
PORT=3000
```

### 3. Start Database Infrastructure

Start PostgreSQL with persistent storage:

```bash
docker compose up -d
```

### 4. Run Database Migrations

Apply the database schema (creates tables and initial seed data):

```bash
npm run db:migrate
```

---

## Usage

### Run the MCP Server (stdio transport)

```bash
npm run start:mcp
```

### Run Compliance Evaluation Harness

```bash
npm run eval
```

---

## Project Structure

```
SentinelMCP/
├── src/
│   ├── db/
│   │   ├── index.ts          # Database connection pool
│   │   ├── migrate.ts        # Schema migration runner
│   │   └── schema.sql        # Tables: compliance_cases, audit_logs
│   ├── harness/
│   │   ├── runner.ts         # Evaluation harness
│   │   └── cases.json        # Test case definitions
│   └── mcp/
│       └── complianceServer.ts # MCP Server & Tool implementations
├── docker-compose.yml        # PostgreSQL container setup
├── package.json
└── tsconfig.json
```

---

## License

ISC
