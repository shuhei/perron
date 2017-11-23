'use strict';

const assert = require('assert');
const http = require('http');
const Agent = require('agentkeepalive');
const request = require('../lib/request');

describe('request timeout', () => {
    let server;
    afterEach(() => {
        server.close();
    });

    describe('with agentkeepalive', () => {
        it('should not leak timeout event handler', (done) => {
            server = http.createServer((req, res) => {
                res.writeHead(200, {
                    'Content-Type': 'application/json'
                });
                setTimeout(() => {
                    res.end(JSON.stringify({ ok: true }));
                }, 10);
            });
            server.on('listening', () => {
                const address = server.address();

                const agent = new Agent();
                const options = {
                    agent,
                    timeout: 100,
                    protocol: 'http:',
                    port: address.port
                };

                const makeRequests = () => {
                    let promise = request(options);
                    for (let index = 0; index < 50; index += 1) {
                        promise = promise.then(response => {
                            assert.equal(response.req.socket.listeners('timeout').length, 1);
                            assert.equal(response.statusCode, 200);
                            return request(options);
                        });
                    }
                    return promise;
                };
                const promises = [];
                for (let index = 0; index < 20; index += 1) {
                    promises.push(makeRequests());
                }
                Promise.all(promises).then(() => {
                    // console.log(agent);
                    done();
                }).catch(done);
            });
            server.listen();
        });

        it('should abort request with timeout', (done) => {
            server = http.createServer((req, res) => {
                setTimeout(() => {
                    res.writeHead(200, {
                        'Content-Type': 'application/json'
                    });
                    res.end(JSON.stringify({ ok: true }));
                }, 100);
            });
            server.on('listening', () => {
                const address = server.address();

                const agent = new Agent();
                const options = {
                    agent,
                    timeout: 20,
                    protocol: 'http:',
                    port: address.port
                };

                request(options).catch(error => {
                    // request.js
                    assert.equal(error.message, 'socket timeout');
                    // agentkeepalive
                    // assert.equal(error.message, 'socket hang up');
                    done();
                }).catch(done);
            });
            server.listen();
        });

        it('should abort request with dropRequestAfter', (done) => {
            server = http.createServer((req, res) => {
                setTimeout(() => {
                    res.writeHead(200, {
                        'Content-Type': 'application/json'
                    });
                    res.end(JSON.stringify({ ok: true }));
                }, 100);
            });
            server.on('listening', () => {
                const address = server.address();

                const agent = new Agent();
                const options = {
                    agent,
                    timeout: 1000,
                    dropRequestAfter: 30,
                    protocol: 'http:',
                    port: address.port
                };

                request(options).catch(error => {
                    assert.equal(error.message, 'request timeout');
                    done();
                }).catch(done);
            });
            server.listen();
        });
    });
});
