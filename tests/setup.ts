// Env the modules under test read at import time. Test values only -- no
// real keys, URLs or addresses.
process.env.NEXT_PUBLIC_USDC_ADDRESS = "0x00000000000000000000000000000000000000c0";
process.env.TIPVAULT_CONTRACT_ADDRESS = "0x00000000000000000000000000000000000000f0";
process.env.NEXT_PUBLIC_MONAD_RPC_URL = "http://127.0.0.1:1";
process.env.OAUTH_STATE_SECRET = "test-secret-that-is-at-least-32-characters-long";
