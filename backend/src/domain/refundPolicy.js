export function getRefund(eventStartsAt,now=new Date(),amount=0){return new Date(eventStartsAt)-new Date(now)>24*60*60*1000?Number(amount):0;}
