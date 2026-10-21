const { Console } = require('node:console');

// Keep logs out of Node 22's test-result pipe: https://github.com/nodejs/node/issues/65934
globalThis.console = new Console({ stdout: process.stderr, stderr: process.stderr });
