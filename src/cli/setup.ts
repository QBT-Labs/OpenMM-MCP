#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as readline from 'readline';

const CONFIG_PATHS: Record<string, Record<string, string>> = {
  'Claude Desktop': {
    darwin: path.join(
      os.homedir(),
      'Library',
      'Application Support',
      'Claude',
      'claude_desktop_config.json'
    ),
    win32: path.join(process.env.APPDATA || '', 'Claude', 'claude_desktop_config.json'),
    linux: path.join(os.homedir(), '.config', 'Claude', 'claude_desktop_config.json'),
  },
  'Claude Code': {
    darwin: path.join(os.homedir(), '.claude', 'settings.json'),
    win32: path.join(os.homedir(), '.claude', 'settings.json'),
    linux: path.join(os.homedir(), '.claude', 'settings.json'),
  },
  Cursor: {
    darwin: path.join(os.homedir(), '.cursor', 'mcp.json'),
    win32: path.join(os.homedir(), '.cursor', 'mcp.json'),
    linux: path.join(os.homedir(), '.cursor', 'mcp.json'),
  },
  Windsurf: {
    darwin: path.join(os.homedir(), '.codeium', 'windsurf', 'mcp_config.json'),
    win32: path.join(os.homedir(), '.codeium', 'windsurf', 'mcp_config.json'),
    linux: path.join(os.homedir(), '.codeium', 'windsurf', 'mcp_config.json'),
  },
};

interface Exchange {
  id: string;
  name: string;
  fields: { key: string; label: string; secret?: boolean }[];
  docsUrl: string;
}

const EXCHANGES: Exchange[] = [
  {
    id: 'mexc',
    name: 'MEXC',
    fields: [
      { key: 'MEXC_API_KEY', label: 'API Key' },
      { key: 'MEXC_SECRET', label: 'Secret Key', secret: true },
    ],
    docsUrl: 'https://www.mexc.com/api',
  },
  {
    id: 'gateio',
    name: 'Gate.io',
    fields: [
      { key: 'GATEIO_API_KEY', label: 'API Key' },
      { key: 'GATEIO_SECRET', label: 'Secret Key', secret: true },
    ],
    docsUrl: 'https://www.gate.io/myaccount/api_key_manage',
  },
  {
    id: 'kraken',
    name: 'Kraken',
    fields: [
      { key: 'KRAKEN_API_KEY', label: 'API Key' },
      { key: 'KRAKEN_SECRET', label: 'Private Key', secret: true },
    ],
    docsUrl: 'https://www.kraken.com/u/security/api',
  },
  {
    id: 'bitget',
    name: 'Bitget',
    fields: [
      { key: 'BITGET_API_KEY', label: 'API Key' },
      { key: 'BITGET_SECRET', label: 'Secret Key', secret: true },
      { key: 'BITGET_PASSPHRASE', label: 'Passphrase', secret: true },
    ],
    docsUrl: 'https://www.bitget.com/account/newapi',
  },
];

function createReadlineInterface(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

function question(rl: readline.Interface, prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer.trim());
    });
  });
}

function selectOption(rl: readline.Interface, prompt: string, options: string[]): Promise<string> {
  return new Promise((resolve) => {
    console.log(`\n${prompt}`);
    options.forEach((opt, i) => console.log(`  ${i + 1}. ${opt}`));
    rl.question('\nEnter number: ', (answer) => {
      const index = parseInt(answer.trim()) - 1;
      if (index >= 0 && index < options.length) {
        resolve(options[index]);
      } else {
        console.log('Invalid selection, using first option.');
        resolve(options[0]);
      }
    });
  });
}

function selectMultiple(
  rl: readline.Interface,
  prompt: string,
  options: { id: string; name: string }[]
): Promise<string[]> {
  return new Promise((resolve) => {
    console.log(`\n${prompt}`);
    options.forEach((opt, i) => console.log(`  ${i + 1}. ${opt.name}`));
    console.log('\n  Enter numbers separated by commas (e.g., 1,2,3)');
    console.log('  Or press Enter for all exchanges');
    rl.question('\nYour selection: ', (answer) => {
      if (!answer.trim()) {
        resolve(options.map((o) => o.id));
        return;
      }
      const indices = answer
        .split(',')
        .map((s) => parseInt(s.trim()) - 1)
        .filter((i) => i >= 0 && i < options.length);
      if (indices.length === 0) {
        resolve(options.map((o) => o.id));
      } else {
        resolve(indices.map((i) => options[i].id));
      }
    });
  });
}

function readConfig(configPath: string): Record<string, unknown> {
  try {
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf-8');
      return JSON.parse(content);
    }
  } catch {
    // File doesn't exist or is invalid JSON
  }
  return {};
}

function writeConfig(configPath: string, config: Record<string, unknown>): void {
  const dir = path.dirname(configPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

const BANNER = `
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║    ██████╗ ██████╗ ███████╗███╗   ██╗███╗   ███╗███╗   ███╗   ║
║   ██╔═══██╗██╔══██╗██╔════╝████╗  ██║████╗ ████║████╗ ████║   ║
║   ██║   ██║██████╔╝█████╗  ██╔██╗ ██║██╔████╔██║██╔████╔██║   ║
║   ██║   ██║██╔═══╝ ██╔══╝  ██║╚██╗██║██║╚██╔╝██║██║╚██╔╝██║   ║
║   ╚██████╔╝██║     ███████╗██║ ╚████║██║ ╚═╝ ██║██║ ╚═╝ ██║   ║
║    ╚═════╝ ╚═╝     ╚══════╝╚═╝  ╚═══╝╚═╝     ╚═╝╚═╝     ╚═╝   ║
║                                                               ║
║   AI-Native Market Making Infrastructure                      ║
║   Configure your exchange API credentials                     ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
`;

async function main(): Promise<void> {
  console.log(BANNER);

  const rl = createReadlineInterface();
  const platform = process.platform as 'darwin' | 'win32' | 'linux';

  try {
    // Select clients (multi-select)
    const clientOptions = Object.keys(CONFIG_PATHS).map((name) => ({ id: name, name }));
    const selectedClientNames = await selectMultiple(
      rl,
      'Which MCP clients do you want to configure?',
      clientOptions
    );

    // Get config paths for selected clients
    const selectedClients: { name: string; path: string }[] = [];
    for (const clientName of selectedClientNames) {
      const configPath = CONFIG_PATHS[clientName][platform];
      if (configPath) {
        selectedClients.push({ name: clientName, path: configPath });
      }
    }

    if (selectedClients.length === 0) {
      console.error(`❌ No supported clients for platform: ${platform}`);
      process.exit(1);
    }

    console.log(`\n📁 Will configure ${selectedClients.length} client(s):`);
    selectedClients.forEach((c) => console.log(`   • ${c.name}: ${c.path}`));

    // Select exchanges
    const exchangeOptions = EXCHANGES.map((e) => ({ id: e.id, name: e.name }));
    const selectedExchangeIds = await selectMultiple(
      rl,
      'Which exchanges do you want to configure?',
      exchangeOptions
    );

    const selectedExchanges = EXCHANGES.filter((e) => selectedExchangeIds.includes(e.id));

    if (selectedExchanges.length === 0) {
      console.log('\n⚠️  No exchanges selected. Exiting.');
      process.exit(0);
    }

    // Collect credentials
    const env: Record<string, string> = {};

    for (const exchange of selectedExchanges) {
      console.log(`\n🔐 ${exchange.name} credentials`);
      console.log(`   Get your API key at: ${exchange.docsUrl}`);

      for (const field of exchange.fields) {
        const value = await question(rl, `   ${field.label}: `);
        if (value) {
          env[field.key] = value;
        }
      }
    }

    // Write config to all selected clients
    for (const client of selectedClients) {
      // Read existing config
      const config = readConfig(client.path);

      // Ensure mcpServers exists
      if (!config.mcpServers) {
        config.mcpServers = {};
      }

      const existingServers = config.mcpServers as Record<string, unknown>;

      // Check for existing openmm config and preserve existing keys
      const existingOpenmm = existingServers['openmm'] as
        | { env?: Record<string, string> }
        | undefined;
      const existingEnv = existingOpenmm?.env || {};

      // Merge existing env with new credentials (new values override)
      const mergedEnv = { ...existingEnv, ...env };

      // Add openmm server
      existingServers['openmm'] = {
        command: 'npx',
        args: ['-y', '@qbtlabs/openmm-mcp'],
        env: mergedEnv,
      };

      // Write config
      writeConfig(client.path, config);

      console.log(`\n✅ OpenMM configured for ${client.name}`);
      console.log(`   ${client.path}`);
    }

    // Show configured exchanges
    const configuredExchanges: string[] = [];
    if (env.MEXC_API_KEY) configuredExchanges.push('MEXC');
    if (env.GATEIO_API_KEY) configuredExchanges.push('Gate.io');
    if (env.KRAKEN_API_KEY) configuredExchanges.push('Kraken');
    if (env.BITGET_API_KEY) configuredExchanges.push('Bitget');

    if (configuredExchanges.length > 0) {
      console.log(`\n📊 Configured exchanges: ${configuredExchanges.join(', ')}`);
    }

    const clientNames = selectedClients.map((c) => c.name).join(', ');
    console.log(`\n🔄 Restart ${clientNames} to activate the changes.`);
    console.log('\n💡 Try asking your agent: "What is my balance on MEXC?"\n');
  } finally {
    rl.close();
  }
}

main().catch((error) => {
  console.error('Setup failed:', error);
  process.exit(1);
});
