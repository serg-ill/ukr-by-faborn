'use strict';

// Persist a finite error code, never an upstream exception, URL or response body.
// Labels are derived on read, including for records written by an older server.
const labels={
    title_not_found:'Назву, рік і тип не знайдено на джерелі',
    player_not_found:'Другий плеєр Alloha не знайдено на сторінці',
    episode_not_found:'Цієї серії немає у другому плеєрі',
    type_mismatch:'Тип плеєра не збігається з карткою',
    no_tracks:'Немає підтримуваних озвучень',
    player_format:'Формат відповіді плеєра змінився',
    uafix_config:'UAFix не віддав конфігурацію плеєра',
    uafix_mismatch:'Плеєр не належить сторінці UAFix',
    upstream_http:'Джерело повернуло помилку HTTP',
    upstream_network:'Не вдалося з’єднатися з джерелом',
    upstream_tls:'Не вдалося встановити захищене з’єднання з джерелом',
    upstream_dns:'Не вдалося визначити адресу джерела',
    upstream_redirect:'Забагато перенаправлень джерела',
    upstream_address:'Джерело повернуло непідтримувану адресу',
    response_too_large:'Відповідь джерела перевищує допустимий розмір',
    timeout:'Джерело не відповіло за 18 секунд',
    invalid_request:'Некоректний запит до обробника',
    auth_failed:'Неправильний або відсутній логін, пароль чи ключ доступу',
    request_too_large:'Запит до обробника перевищує 16 КіБ',
    busy:'Обробник зайнятий або досягнуто ліміту запитів',
    accounts_unavailable:'Файл облікових записів недоступний',
    client_closed:'Клієнт закрив запит до отримання відповіді',
    resolver_error:'Помилка обробки відповіді джерела'
};
const statusCodes={400:'invalid_request',401:'auth_failed',403:'auth_failed',413:'request_too_large',429:'busy',499:'client_closed',503:'accounts_unavailable'};
function statusCode(status) { return statusCodes[status]||''; }
function failure(error,{timedOut=false}={}) {
    if(timedOut)return {errorCode:'timeout'};
    const message=String(error?.message||'');
    const http=/^(?:Джерело:|UAFix:) HTTP ([1-5][0-9]{2})$/.exec(message);
    if(http)return {errorCode:'upstream_http',upstreamStatus:Number(http[1])};
    const exact={
        'Назву, рік і тип не знайдено':'title_not_found',
        'PLAYER: другий плеєр не знайдено':'player_not_found',
        'EPISODE: цієї серії немає у другому плеєрі':'episode_not_found',
        'Тип плеєра не збігається з карткою':'type_mismatch',
        'Немає підтримуваних озвучень':'no_tracks',
        'SESSION: формат плеєра змінився':'player_format',
        'UAFix не віддав конфігурацію плеєра':'uafix_config',
        'Плеєр не належить сторінці UAFix':'uafix_mismatch',
        'Забагато перенаправлень':'upstream_redirect',
        'Адреса поза джерелом':'upstream_address',
        'Завелика відповідь':'response_too_large',
        'Завелика відповідь джерела':'response_too_large',
        'Завелика сторінка UAFix':'response_too_large'
    };
    if(Object.hasOwn(exact,message))return {errorCode:exact[message]};
    if(error instanceof SyntaxError)return {errorCode:'player_format'};
    const code=error?.cause?.code||error?.code;
    if(['ENOTFOUND','EAI_AGAIN'].includes(code))return {errorCode:'upstream_dns'};
    if(['CERT_HAS_EXPIRED','UNABLE_TO_VERIFY_LEAF_SIGNATURE','DEPTH_ZERO_SELF_SIGNED_CERT','ERR_TLS_CERT_ALTNAME_INVALID'].includes(code))return {errorCode:'upstream_tls'};
    if(message==='fetch failed'||['ECONNRESET','ECONNREFUSED','ETIMEDOUT','UND_ERR_CONNECT_TIMEOUT','UND_ERR_SOCKET'].includes(code))return {errorCode:'upstream_network'};
    return {errorCode:'resolver_error'};
}
function eventDetails(input) {
    const provider=['uakinogo','uafix'].includes(input.provider)?input.provider:'';
    const errorCode=input.status>=400&&Object.hasOwn(labels,input.errorCode)?input.errorCode:'';
    const upstreamStatus=errorCode==='upstream_http'&&Number.isInteger(input.upstreamStatus)&&input.upstreamStatus>=100&&input.upstreamStatus<=599?input.upstreamStatus:0;
    return {provider,errorCode,upstreamStatus};
}
function reason(event) {
    if(event.status<400)return '';
    const safe=eventDetails(event);
    return (labels[safe.errorCode]||'Причину не записано')+(safe.upstreamStatus?' '+safe.upstreamStatus:'');
}
module.exports={failure,statusCode,eventDetails,reason};
