# Contributing to OpenMM MCP Server

Thanks for your interest in contributing to the OpenMM MCP Server! This guide will help you get started.

## Getting Started

1. Fork the repository
2. Clone your fork locally
3. Install dependencies:
   ```bash
   npm install
   ```
4. Create a feature branch:
   ```bash
   git checkout -b feat/your-feature
   ```

## Development Setup

1. Copy the environment template and configure your exchange API keys:
   ```bash
   cp .env.example .env
   ```
2. Build the project:
   ```bash
   npm run build
   ```
3. Run in development mode:
   ```bash
   npm run dev
   ```

## Project Structure

- `src/index.ts` — MCP server entry point and tool registration
- `src/exchange.ts` — Exchange client management via OpenMM CEX adapters
- `src/cardano.ts` — Cardano DEX pool discovery and pricing
- `src/grid.ts` — Grid trading strategy logic

## Making Changes

- Follow the existing code style and conventions
- Use TypeScript for all new code
- Keep MCP tool handlers focused — business logic belongs in separate modules
- Test your changes against a real exchange (use small order sizes)

## Submitting a Pull Request

1. Ensure your code builds cleanly:
   ```bash
   npm run build
   ```
2. Lint your code:
   ```bash
   npm run lint
   ```
3. Commit with a clear, descriptive message
4. Push to your fork and open a PR against `main`
5. Describe what your PR does and why

## Adding New MCP Tools

When adding a new tool:

1. Define the tool schema in `src/index.ts` under the `tools/list` handler
2. Implement the handler in the `tools/call` handler
3. Keep input validation at the tool boundary
4. Return clear, structured JSON responses
5. Update the README with the new tool documentation

## Reporting Issues

- Use GitHub Issues for bug reports and feature requests
- Include steps to reproduce for bugs
- Mention which exchange(s) are affected if relevant

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
