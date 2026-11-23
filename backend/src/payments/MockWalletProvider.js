export class MockWalletProvider { async charge({amount,idempotencyKey}) { return {success:true,reference:`WALLET-${idempotencyKey}`,amount}; } }
