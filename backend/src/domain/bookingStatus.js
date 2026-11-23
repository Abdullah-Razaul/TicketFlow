const transitions={HELD:['PENDING_PAYMENT','CONFIRMED','EXPIRED','CANCELLED'],PENDING_PAYMENT:['CONFIRMED','EXPIRED','CANCELLED'],CONFIRMED:['CANCELLED'],EXPIRED:[],CANCELLED:[]};
export function canTransition(from,to){return (transitions[from]||[]).includes(to);}
