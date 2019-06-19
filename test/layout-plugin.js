'use strict';

const { PodletServer } = require('@podium/test-utils');
const { URL } = require('url');
const Layout = require('@podium/layout');
const Hapi = require('@hapi/hapi');
const http = require('http');
const tap = require('tap');

const HapiLayout = require('../');

class Server {
    constructor(options = {}, podletAddr) {
        this.app = Hapi.Server({
            host: 'localhost',
            port: 0,
        });

        const layout = new Layout(
            Object.assign(
                {
                    pathname: '/',
                    name: 'layout',
                },
                options,
            ),
        );

        layout.view((incoming, fragment) => {
            return `## ${fragment} ##`;
        });

        const podlet = layout.client.register(podletAddr.options);

        this.app.register({
            plugin: new HapiLayout(),
            options: layout,
        });

        this.app.route({
            method: 'GET',
            path: layout.pathname(),
            handler: async (request, h) => {
                const result = await podlet.fetch(request.app.podium);
                return h.podiumSend(result.content);
            },
        });

        // 404 route
        this.app.route({
            method: '*',
            path: '/{any*}',
            handler: (request, h) => {
                const response = h.response('Not found');
                response.code(404);
                response.header('Content-Type', 'text/plain');
                return response;
            },
        });
    }

    listen() {
        return new Promise((resolve, reject) => {
            setTimeout(async () => {
                try {
                    await this.app.start();
                    resolve(this.app.info.uri);
                } catch (error) {
                    reject(error);
                }
            }, 100);
        });
    }

    close() {
        return new Promise(resolve => {
            setTimeout(async () => {
                await this.app.stop();
                resolve();
            }, 100);
        });
    }
}

const request = (
    { pathname = '/', address = '', headers = {}, method = 'GET' } = {},
    payload,
) => {
    return new Promise((resolve, reject) => {
        const url = new URL(pathname, address);

        if (method === 'POST' || method === 'PUT' || method === 'DELETE') {
            headers = Object.assign(headers, {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(payload),
            });
        }

        const options = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname,
            headers,
            method,
        };

        const req = http
            .request(options, res => {
                const chunks = [];
                res.on('data', chunk => {
                    chunks.push(chunk);
                });
                res.on('end', () => {
                    resolve({
                        headers: res.headers,
                        body: chunks.join(''),
                    });
                });
            })
            .on('error', error => {
                reject(error);
            });

        if (method === 'POST' || method === 'PUT' || method === 'DELETE') {
            req.write(payload);
        }

        req.end();
    });
};

/**
 * Constructor
 */

tap.test(
    'Constructor() - object type - should be PodiumLayoutHapiPlugin',
    t => {
        const layout = new HapiLayout();
        t.equal(
            Object.prototype.toString.call(layout),
            '[object PodiumLayoutHapiPlugin]',
        );
        t.end();
    },
);

/**
 * Generic tests
 */

tap.test(
    'request layout pathname - should fetch content from podlet and return content wrapped in a document template',
    async t => {
        const podlet = new PodletServer();
        const service = await podlet.listen();

        const layout = new Server({}, service);
        const address = await layout.listen();

        const result = await request({ address, pathname: '/' });
        t.equal(result.body, '## <p>content component</p> ##');

        await layout.close();
        await podlet.close();
        t.end();
    },
);

tap.test(
    'request layout pathname - podlet is dead - should return fallback wrapped in a document template',
    async t => {
        const podlet = new PodletServer();
        const service = await podlet.listen();

        const layout = new Server({}, service);
        const address = await layout.listen();

        // Make sure layout has manifest
        await request({ address, pathname: '/' });

        // Kill podlet
        await podlet.close();

        const result = await request({ address, pathname: '/' });
        t.equal(result.body, '## <p>fallback component</p> ##');

        await layout.close();
        t.end();
    },
);

tap.test(
    'GET to "proxy" url - should proxy the request to the Podlets target endpoint',
    async t => {
        const podlet = new PodletServer();
        const service = await podlet.listen();

        const layout = new Server({}, service);
        const address = await layout.listen();

        // Make sure layout has manifest so proxy endpoints are mounted
        await request({ address, pathname: '/' });

        // Request proxy endpoint
        const result = await request({
            address,
            method: 'GET',
            pathname: '/podium-resource/component/localApi',
        });

        const body = JSON.parse(result.body);

        t.equal(body.body, 'GET proxy target');

        await layout.close();
        await podlet.close();
        t.end();
    },
);

tap.test(
    'POST to "proxy" url - should proxy the request to the Podlets target endpoint',
    async t => {
        const podlet = new PodletServer();
        const service = await podlet.listen();

        const layout = new Server({}, service);
        const address = await layout.listen();

        // Make sure layout has manifest so proxy endpoints are mounted
        await request({ address, pathname: '/' });

        // Request proxy endpoint
        const result = await request(
            {
                address,
                method: 'POST',
                pathname: '/podium-resource/component/localApi',
            },
            'proxy payload',
        );

        const body = JSON.parse(result.body);

        t.equal(body.payload, 'proxy payload');
        t.equal(body.body, 'POST proxy target');

        await layout.close();
        await podlet.close();
        t.end();
    },
);

tap.test(
    'PUT to "proxy" url - should proxy the request to the Podlets target endpoint',
    async t => {
        const podlet = new PodletServer();
        const service = await podlet.listen();

        const layout = new Server({}, service);
        const address = await layout.listen();

        // Make sure layout has manifest so proxy endpoints are mounted
        await request({ address, pathname: '/' });

        // Request proxy endpoint
        const result = await request(
            {
                address,
                method: 'PUT',
                pathname: '/podium-resource/component/localApi',
            },
            'proxy payload',
        );

        const body = JSON.parse(result.body);

        t.equal(body.payload, 'proxy payload');
        t.equal(body.body, 'PUT proxy target');

        await layout.close();
        await podlet.close();
        t.end();
    },
);
