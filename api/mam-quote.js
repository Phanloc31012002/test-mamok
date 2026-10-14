import {createKtsQuoteHandler} from '../server/kts-quote.mjs';

// Server-only proxy; clients send public print specifications, never chat.
const handle=createKtsQuoteHandler();
export const maxDuration=10;
export default {fetch:handle};
