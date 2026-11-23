export class MockCardProvider { async charge({amount,idempotencyKey}) { return {success:true,reference:`CARD-${idempotencyKey}`,amount}; } }
