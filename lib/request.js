'use strict';

const http = require('http');
const https = require('https');
const zlib = require('zlib');
const querystring = require('querystring');

const getInterval = (time) => {
    const diff = process.hrtime(time);
    return Math.round((diff[0] * 1000) + (diff[1] / 1000000));
};

module.exports = (options) => {
    options = Object.assign({
        protocol: 'https:'
    }, options);

    if ('pathname' in options && !('path' in options)) {
        if ('query' in options) {
            options.path = `${options.pathname}?${querystring.stringify(options.query)}`;
        } else {
            options.path = options.pathname;
        }
    }

    const httpModule = options.protocol === 'https:' ? https : http;
    return new Promise((resolve, reject) => {
        let hasRequestEnded = false;
        let startTime;
        let timings;
        if (options.timing) {
            startTime = process.hrtime();
            timings = {};
        }
        const request = httpModule.request(options, (response) => {
            if (options.timing) {
                if (timings.lookup === undefined) {
                    timings.lookup = timings.socket;
                }
                if (timings.connect === undefined) {
                    timings.connect = timings.socket;
                }
                timings.response = getInterval(startTime);
            }
            let bodyStream;
            const chunks = [];
            const encoding = response.headers && response.headers['content-encoding'];
            if (encoding === 'gzip' || encoding === 'deflate') {
                response.on('error', reject);
                bodyStream = response.pipe(zlib.createUnzip());
            } else {
                bodyStream = response;
            }
            bodyStream.on('error', reject);
            bodyStream.on('data', (chunk) => {
                chunks.push(chunk);
            });
            bodyStream.on('end', () => {
                response.body = Buffer.concat(chunks).toString('utf8');
                response.request = options;
                hasRequestEnded = true;
                if (options.timing) {
                    timings.end = getInterval(startTime);
                    response.timings = timings;
                    response.timingPhases = {
                        wait: timings.socket,
                        dns: timings.lookup - timings.socket,
                        tcp: timings.connect - timings.lookup,
                        firstByte: timings.response - timings.connect,
                        download: timings.end - timings.response,
                        total: timings.end
                    };
                }
                resolve(response);
            });
        });
        if (options.timing) {
            request.once('socket', (socket) => {
                timings.socket = getInterval(startTime);
                if (socket.connecting) {
                    const onLookUp = () => {
                        timings.lookup = getInterval(startTime);
                    };
                    const onConnect = () => {
                        timings.connect = getInterval(startTime);
                    };
                    socket.once('lookup', onLookUp);
                    socket.once('connect', onConnect);
                    request.once('error', () => {
                        socket.removeListener('lookup', onLookUp);
                        socket.removeListener('connect', onConnect);
                    });
                } else {
                    timings.lookup = timings.socket;
                    timings.connect = timings.socket;
                }
            });
        }
        request.on('error', reject);
        // Not necessary if keepalive agent...
        // But you don't need to removeListener because request is thrown away for
        // each request.
        request.on('timeout', () => {
            request.abort();
            reject(new Error('socket timeout'));
        });
        // PATCH START
        if (options.timeout) {
            // options.timeout passed to httpModule.request() doesn't work somehow.
            // Is it only for connection?
            request.setTimeout(options.timeout);
        }
        // PATCH END
        if (options.dropRequestAfter) {
            setTimeout(() => {
                if (!hasRequestEnded) {
                    request.abort();
                    reject(new Error('request timeout'));
                }
            }, options.dropRequestAfter);
        }
        if (options.body) {
            request.write(options.body);
        }
        request.end();
    });
};
