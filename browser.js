const Peer = require('simple-peer');
const h = require('hyperscript');
const hashObj = require('hash-obj');
const sillyname = require('sillyname');
const xhr = require('xhr');

const isServer = window.location.hash === '#server';

const log = h('pre', {
    style: {
        'background-color': '#000',
        'overflow-y': 'scroll',
        color: '#fff',
        height: '120px'
    }
});

const input = h('input', { type: 'text' });

function say(log, msg) {
    log.textContent += msg + '\n';
    log.scrollTop = log.scrollHeight;
}

function ask(url, done) {
    xhr(url, {
        json: true
    }, (err, res, body) => {
        if (err) {
            return done(err);
        }

        if (res.statusCode !== 200) {
            return done(
                new Error('server removed our offer before answer'));
        }

        if (body) {
            say(log, 'reply! ' + JSON.stringify(body));
            return done(null, body);
        }

        setTimeout(() => ask(url, done), 1000);
    });
}

class Server {
    constructor() {
        this.nick = sillyname().toLowerCase();
        this.peers = [];
        this.userLimit = 10;
        this.waitingForSignal = false;
    }

    askForAnswer(offerHash, done) {
        say(log, 'asking for answer...');
        ask('/answer?offer=' + offerHash,  done);
    }

    makeOffer(offer, done) {
        const offerHash = hashObj(offer.offer, { algorithm: 'sha1' });
        say(log, 'making offer: ' + offerHash);

        xhr('/offer', {
            body: offer,
            json: true,
            method: 'post'
        }, (err, res, body) => {
            if (err) {
                return done(err);
            }

            if (res.statusCode === 200) {
                return done(null, offerHash);
            }
        });
    }

    generatePeer() {
        if (this.waitingForSignal || this.peers.length >= this.userLimit) {
            return;
        }

        this.waitingForSignal = true;

        const peer = new Peer({ initiator: true, trickle: false });
        const offer = { offer: null, candidates: [] };
        let hasOffered = false;

        peer.on('connect', () => {
            say(log, 'new peer connected!');
        });

        peer.on('data', data => {
            say(log, data);

            this.peers.forEach(p => {
                p.send(data);
            });
        });

        peer.on('signal', data => {
            if (data.type === 'offer') {
                offer.offer = data;
            } else if (data.candidate) {
                offer.candidates.push(data.candidate);
            }

            if (hasOffered) {
                return;
            }

            hasOffered = true;

            setTimeout(() => {
                this.makeOffer(offer, (err, offerHash) => {
                    if (err) {
                        return console.error(err);
                    }

                    this.askForAnswer(offerHash, (err, answer) => {
                        if (err) {
                            return console.error(err);
                        }

                        peer.signal(answer.answer);
                        answer.candidates.forEach(candidate => {
                            peer.signal({ candidate });
                        });
                        this.waitingForSignal = false;
                        this.generatePeer();
                    });
                });
            }, 2000);
        });

        this.peers.push(peer);
    }

    sendMessage(msg) {
        msg = `${this.nick}: ${msg}`;
        say(log, msg);

        this.peers.forEach(p => {
            if (p.connected) {
                p.send(msg);
            }
        });
    }

    start() {
        this.generatePeer();
    }
}

class Client {
    constructor() {
        this.nick = sillyname().toLowerCase();
        this.peer = new Peer();
        this.nasty = null;
    }

    answerOffer(answer, offer, done) {
        const offerHash = hashObj(offer.offer, { algorithm: 'sha1' });

        xhr(`/answer?offer=${offerHash}`, {
            body: answer,
            json: true,
            method: 'post'
        }, (err, res, body) => {
            if (err) {
                return done(err);
            }

            if (!/^2/.test(res.statusCode)) {
                return done(new Error(`${res.statusCode}: ${body}`));
            }

            done();
        });
    }

    askForLatestOffer(done) {
        say(log, 'asking for latest offer...');
        ask('/offer', done);
    }

    connectToLobby() {
        this.peer.on('connect', () => {
            say(log, 'connected to server!');
        });

        this.peer.on('data', data => {
            if (data.toString() === this.nasty) {
                return;
            }

            say(log, data);
        });

        this.askForLatestOffer((err, offer) => {
            if (err) {
                return console.error(err);
            }

            const answer = { answer: null, candidates: [] };
            let hasAnswered = false;

            this.peer.on('signal', data => {
                if (data.type === 'answer') {
                    answer.answer = data;
                } else if (data.candidate) {
                    answer.candidates.push(data.candidate);
                }

                if (hasAnswered) {
                    return;
                }

                hasAnswered = true;

                setTimeout(() => {
                    this.answerOffer(answer, offer, (err) => {
                        if (err) {
                            return console.error(err);
                        }

                        say(log, 'sent answer to lobby!');
                    });
                }, 2000);
            });

            this.peer.signal(offer.offer);
            offer.candidates.forEach(c => this.peer.signal({ c }));
        });
    }

    sendMessage(msg) {
        msg = `${this.nick}: ${msg}`;
        this.nasty = msg;
        say(log, msg);
        this.peer.send(msg);
    }

    start() {
        this.connectToLobby();
    }
}

let serclient;

if (isServer) {
    say(log, 'server initiating...');
    serclient = new Server();
} else {
    say(log, 'client initiating...');
    serclient = new Client();
}

serclient.start();

input.addEventListener('keyup', e => {
    if (e.keyCode === 13) {
        serclient.sendMessage(input.value);
        input.value = '';
    }
}, false);

document.body.appendChild(log);
document.body.appendChild(input);
