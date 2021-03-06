const fs = require('fs');
const http = require('http');
const querystring = require('querystring');
const bodyParser = require('body-parser');
const hashObj = require('hash-obj');

const indexHtml = fs.readFileSync('./index.html');

// this would be a SQL table
const lobbyOffers = {
    /*offerHash: {
        offer: { offer, candidates },
        answer: { answer, candidates }
    }*/
};

let offerStack = []

function last(arr) {
    return arr[arr.length - 1];
}

function sendJson(req, res, obj) {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(obj));
}

const server = http.createServer((req, res) => {
    if (/^\/answer/.test(req.url)) {
        const query = querystring.parse(req.url.replace('/answer?', ''));
        const offerHash = query ? query.offer : null;

        if (!lobbyOffers.hasOwnProperty(offerHash)) {
            res.statusCode = 404;
            return sendJson(req, res, 'not found');
        }

        if (/get/i.test(req.method)) {
            console.log('requesting answer for', offerHash);

            let answer = lobbyOffers[offerHash].answer;

            if (!answer) {
                sendJson(req, res, null);
                return;
            }

            console.log('deleting ', offerHash);
            console.log(offerStack);

            delete lobbyOffers[offerHash];
            offerStack = offerStack.filter(hash => {
                return hash !== offerHash;
            });

            console.log(offerStack);

            sendJson(req, res, answer);
            return;
        } else if (/post/i.test(req.method)) {
            bodyParser.json()(req, res, () => {
                const answer = req.body.answer;

                if (!answer || answer.type !== 'answer') {
                    res.statusCode = 404;
                    sendJson(req, res, 'not found');
                    return;
                }

                console.log('new answer for ', offerHash);

                const candidates = req.body.candidates;
                lobbyOffers[offerHash].answer = { answer, candidates };

                sendJson(req, res, true);
            });

            return;
        }
    } else if (/^\/offer/.test(req.url)) {
        if (/get/i.test(req.method)) {
            console.log('requesting latest offer...');

            if (!offerStack.length) {
                sendJson(req, res, null);
                return;
            }

            sendJson(req, res, lobbyOffers[last(offerStack)].offer);
            return;
        } else if (/post/i.test(req.method)) {
            bodyParser.json()(req, res, () => {
                const offer = req.body.offer;

                if (!offer || offer.type !== 'offer') {
                    res.statusCode = 404;
                    sendJson(req, res, 'not found');
                    return;
                }

                const candidates = req.body.candidates;
                const offerHash = hashObj(offer, { algorithm: 'sha1' });

                console.log('new offer', offerHash);

                lobbyOffers[offerHash] = { offer: { candidates, offer } };
                offerStack.push(offerHash);
                sendJson(req, res, true);
            });

            return;
        }
    }

    if (req.url === '/') {
        res.end(indexHtml);
    } else {
        res.statusCode = 404;
        sendJson(req, res, 'not found');
    }
});

server.listen(1338);
