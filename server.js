"use strict";

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { createCanvas, loadImage } = require('canvas');
const path = require('path');

// Express & サーバー設定
const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

// =========================================================================
// [注意] Tiny2D.js のコアモジュールを環境に合わせてインポートしてください。
// ここでは元のグローバル定義をシミュレート、または require します。
// 例: const { Engine, RectangleEntity, CircleEntity, BodyDynamic } = require('./Tiny2D');
// =========================================================================

// --- ルーティング設定 ---
// クライアント側（index.html）をブラウザに返す
// --- ルーティング設定 ---

// カレントディレクトリ（3DTilt-sim）の中にあるファイルを静的ファイルとしてブラウザに公開する設定
app.use(express.static(__dirname)); 

// クライアント側（index.html）をブラウザに返す
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});
app.get('/favicon.ico', (req, res) => res.status(204).end());
"use strict";

var BodyStatic = 1;
var BodyDynamic = 2;
var ShapeCircle = 3;
var ShapeRectangle = 4;
var ShapeLine = 5;

function Vec(x, y) {
    this.x = x;
    this.y = y;
}

Vec.prototype.add = function (v) {      // 加算
    return new Vec(this.x + v.x, this.y + v.y);
}

Vec.prototype.mul = function (x, y) {   // 掛算
    var y = y || x;
    return new Vec(this.x * x, this.y * y);
}

Vec.prototype.dot = function (v) {      // 内積
    return this.x * v.x + this.y * v.y;
}

Vec.prototype.cross = function (v) {    // 外積
    return this.x * v.y - v.x * this.y;
}

Vec.prototype.move = function (dx, dy) {// 自分を移動
    this.x += dx;
    this.y += dy;
}

// 矩形オブジェクト
function RectangleEntity(x, y, width, height) {
    this.shape = ShapeRectangle;
    this.type = BodyStatic;
    this.x = x;
    this.y = y;
    this.w = width;
    this.h = height;
    this.deceleration = 1.0;
    this.isHit = function (i, j) {
        return (this.x <= i && i <= this.x + this.w &&
            this.y <= j && j <= this.y + this.h)
    }
}

// 線オブジェクト
function LineEntity(x0, y0, x1, y1, restitution) {
    this.shape = ShapeLine;
    this.type = BodyStatic;
    this.x = (x0 + x1) / 2;
    this.y = (y0 + y1) / 2;
    this.x0 = x0;
    this.y0 = y0;
    this.x1 = x1;
    this.y1 = y1;

    this.restitution = restitution || 0.9;
    this.vec = new Vec(x1 - x0, y1 - y0);
    var length = Math.sqrt(Math.pow(this.vec.x, 2) + Math.pow(this.vec.y, 2));
    this.norm = new Vec(y0 - y1, x1 - x0).mul(1 / length);
}

// 円オブジェクト
function CircleEntity(x, y, radius, type, restitution, deceleration) {
    this.shape = ShapeCircle;
    this.type = type || BodyDynamic;
    this.x = x;
    this.y = y;
    this.radius = radius;
    this.restitution = restitution || 0.9;
    this.deceleration = deceleration || 1.0;
    this.accel = new Vec(0, 0);
    this.velocity = new Vec(0, 0);

    this.move = function (dx, dy) { // 円を移動
        this.x += dx;
        this.y += dy;
    }

    this.isHit = function (x, y) {
        var d2 = Math.pow(x - this.x, 2) + Math.pow(y - this.y, 2);
        return d2 < Math.pow(this.radius, 2);
    }

    this.collidedWithRect = function (r) {  // 円と矩形の衝突
        // 矩形の４辺上で最も円に近い座標(nx, ny)を求める
        var nx = Math.max(r.x, Math.min(this.x, r.x + r.w));
        var ny = Math.max(r.y, Math.min(this.y, r.y + r.h));
        
        if (!this.isHit(nx, ny)) {      // 衝突なし→リターン
            return;
        }

        if (this.onhit) {               // 衝突時のコールバック
            this.onhit(this, r);
        }

        var d2 = Math.pow(nx - this.x, 2) + Math.pow(ny - this.y, 2);
        var overlap = Math.abs(this.radius - Math.sqrt(d2));
        var mx = 0, my = 0;

        if (ny == r.y) {		        // 上辺衝突
            my = -overlap;
        } else if (ny == r.y + r.h) {	// 下辺衝突
            my = overlap;
        } else if (nx == r.x) {         // 左辺衝突
            mx = -overlap;
        } else if (nx == r.x + r.w) {   // 右辺衝突
            mx = overlap;
        } else {    // 矩形の中
            mx = -this.velocity.x;
            my = -this.velocity.y;
        }

        this.move(mx, my);
        if (mx) {   // X軸方向へ反転
            this.velocity = this.velocity.mul(-1 * this.restitution, 1);
        }
        if (my) {   // Y軸方向へ反転
            this.velocity = this.velocity.mul(1, -1 * this.restitution);
        }
    }

    this.collidedWithLine = function (line) {  // 円と線の衝突
        var v0 = new Vec(line.x0 - this.x + this.velocity.x, line.y0 - this.y + this.velocity.y);
        var v1 = this.velocity;
        var v2 = new Vec(line.x1 - line.x0, line.y1 - line.y0);
        var cv1v2 = v1.cross(v2);
        var t1 = v0.cross(v1) / cv1v2;
        var t2 = v0.cross(v2) / cv1v2;
        var crossed = (0 <= t1 && t1 <= 1) && (0 <= t2 && t2 <= 1);

        if (crossed) {
            this.move(-this.velocity.x, -this.velocity.y);
            var dot0 = this.velocity.dot(line.norm);   // 法線と速度の内積
            var vec0 = line.norm.mul(-2 * dot0);
            this.velocity = vec0.add(this.velocity);
            this.velocity = this.velocity.mul(line.restitution * this.restitution);
        }
    }

    this.collidedWithCircle = function (peer) {  // 円と円の衝突
        var d2 = Math.pow(peer.x - this.x, 2) + Math.pow(peer.y - this.y, 2);
        if (d2 >= Math.pow(this.radius + peer.radius, 2)) {
            return;
        }

        if (this.onhit) {
            this.onhit(this, peer);
        }
        if (peer.onhit) {
            peer.onhit(peer, this);
        }

        var distance = Math.sqrt(d2) || 0.01;
        var overlap = this.radius + peer.radius - distance;

        var v = new Vec(this.x - peer.x, this.y - peer.y);
        var aNormUnit = v.mul(1 / distance);        // 法線単位ベクトル１
        var bNormUnit = aNormUnit.mul(-1);          // 法線単位ベクトル２

        
        if (this.type == BodyDynamic && peer.type == BodyStatic) {
            this.move(aNormUnit.x * overlap, aNormUnit.y * overlap);
            var dot0 = this.velocity.dot(aNormUnit);   // 法線と速度の内積
            var vec0 = aNormUnit.mul(-2 * dot0);
            this.velocity = vec0.add(this.velocity);
            this.velocity = this.velocity.mul(this.restitution);
        }
        else if (peer.type == BodyDynamic && this.type == BodyStatic) {
            peer.move(bNormUnit.x * overlap, bNormUnit.y * overlap);
            var dot1 = peer.velocity.dot(bNormUnit);   // 法線と速度の内積
            var vec1 = bNormUnit.mul(-2 * dot1);
            peer.velocity = vec1.add(peer.velocity);
            peer.velocity = peer.velocity.mul(peer.restitution);
        }
        else {
            this.move(aNormUnit.x * overlap / 2, aNormUnit.y * overlap / 2);
            peer.move(bNormUnit.x * overlap / 2, bNormUnit.y * overlap / 2);

            var aTangUnit = new Vec(aNormUnit.y * -1, aNormUnit.x); // 接線ベクトル１
            var bTangUnit = new Vec(bNormUnit.y * -1, bNormUnit.x); // 接線ベクトル２

            var aNorm = aNormUnit.mul(aNormUnit.dot(this.velocity)); // aベクトル法線成分
            var aTang = aTangUnit.mul(aTangUnit.dot(this.velocity)); // aベクトル接線成分
            var bNorm = bNormUnit.mul(bNormUnit.dot(peer.velocity)); // bベクトル法線成分
            var bTang = bTangUnit.mul(bTangUnit.dot(peer.velocity)); // bベクトル接線成分

            this.velocity = new Vec(bNorm.x + aTang.x, bNorm.y + aTang.y);
            peer.velocity = new Vec(aNorm.x + bTang.x, aNorm.y + bTang.y);
        }
    }
}

// 物理エンジン
function Engine(x, y, width, height, gravityX, gravityY) {
    this.worldX = x || 0;
    this.worldY = y || 0;
    this.worldW = width || 1000;
    this.worldH = height || 1000;
    this.gravity = new Vec(gravityX, gravityY);
    this.entities = [];

    this.setGravity = function (x, y) {
        this.gravity.x = x;
        this.gravity.y = y;
    }

    this.step = function (elapsed) {
        var gravity = this.gravity.mul(elapsed, elapsed);
        var entities = this.entities;

        // entityを移動
        entities.forEach(function (e) {
            if (e.type == BodyDynamic) {
                var accel = e.accel.mul(elapsed, elapsed);
                e.velocity = e.velocity.add(gravity);
                e.velocity = e.velocity.add(accel);
                e.velocity = e.velocity.mul(e.deceleration);
                e.move(e.velocity.x, e.velocity.y);
            }
        });

        // 範囲外のオブジェクトを削除
        this.entities = entities.filter(function (e) {
            return this.worldX <= e.x && e.x <= this.worldX + this.worldW &&
                this.worldY <= e.y && e.y <= this.worldY + this.worldH;
        }, this);

        // 衝突判定 & 衝突処理
        for (var i = 0 ; i < entities.length - 1 ; i++) {
            for (var j = i + 1; j < entities.length ; j++) {
                var e0 = entities[i], e1 = entities[j];
                if (e0.type == BodyStatic && e1.type == BodyStatic) {
                    continue;
                }

                if (e0.shape == ShapeCircle && e1.shape == ShapeCircle) {
                    e0.collidedWithCircle(e1);
                } else if (e0.shape == ShapeCircle && e1.shape == ShapeLine) {
                    e0.collidedWithLine(e1);
                } else if (e0.shape == ShapeLine && e1.shape == ShapeCircle) {
                    e1.collidedWithLine(e0);
                } else if (e0.shape == ShapeCircle && e1.shape == ShapeRectangle) {
                    e0.collidedWithRect(e1);
                } else if (e0.shape == ShapeRectangle && e1.shape == ShapeCircle) {
                    e1.collidedWithRect(e0);
                }
            }
        }
    }
}

// --- 3D幾何学・演算クラス群 (元のコードのロジック) ---
function Vec3(x, y, z) {
    this.x = x; this.y = y; this.z = z;
    this.normalize = function () {
        var scale = 1 / Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
        this.x *= scale; this.y *= scale; this.z *= scale;
        return this;
    }
}

function Surface(vertices, near) {
    this.pos = vertices;
    var p1 = vertices[0], p2 = vertices[1], p3 = vertices[2], p4 = vertices[3];
    var p = new Vec3(p1.x - p2.x, p1.y - p2.y, p1.z - p2.z);
    var q = new Vec3(p1.x - p3.x, p1.y - p3.y, p1.z - p3.z);
    var n = new Vec3(
        p.y * q.z - p.z * q.y,
        p.z * q.x - p.x * q.z,
        p.x * q.y - p.y * q.x
    );
    this.norm = n.normalize();
    var cX = (p1.x + p2.x + p3.x + p4.x) / 4;
    var cY = (p1.y + p2.y + p3.y + p4.y) / 4;
    this.cZ = (p1.z + p2.z + p3.z + p4.z) / 4 + Math.sqrt(cX*cX + cY*cY);
    if (near) this.cZ -= 100;
}

function Cube(x, y, z, w, h, d, near) {
    this.pos = []; this.near = near;
    this.vertices = [
        { x: x - w, y: y - h, z: z + d }, { x: x - w, y: y + h, z: z + d },
        { x: x + w, y: y + h, z: z + d }, { x: x + w, y: y - h, z: z + d },
        { x: x - w, y: y - h, z: z - d }, { x: x - w, y: y + h, z: z - d },
        { x: x + w, y: y + h, z: z - d }, { x: x + w, y: y - h, z: z - d }
    ];
    this.polygons = [[2, 1, 5, 6], [0, 1, 2, 3], [4, 5, 1, 0], [2, 6, 7, 3], [7, 6, 5, 4], [0, 3, 7, 4]];
    this.getSurfaces = function () {
        var r = [];
        for (var i = 0 ; i < this.polygons.length ; i++) {
            var indices = this.polygons[i], p = [];
            for (var j = 0 ; j < indices.length ; j++) p.push(this.pos[indices[j]]);
            r.push(new Surface(p, this.near));
        }
        return r;
    };
    this.setCamera = function (cameraX, cameraZ, cameraY, mRotX, mRotY) {
        for (var i = 0 ; i < this.vertices.length ; i++) {
            var c = this.vertices[i];
            var x = c.x - cameraX, y = c.y - cameraY, z = c.z;
            var p = mRotY[0]*x + mRotY[1]*y + mRotY[2]*z;
            var q = mRotY[3]*x + mRotY[4]*y + mRotY[5]*z;
            var r = mRotY[6]*x + mRotY[7]*y + mRotY[8]*z;
            x = mRotX[0]*p + mRotX[1]*q + mRotX[2]*r;
            y = mRotX[3]*p + mRotX[4]*q + mRotX[5]*r;
            z = mRotX[6]*p + mRotX[7]*q + mRotX[8]*r;
            z -= cameraZ;
            this.pos[i] = { x: x, y: y, z: z };
        }
    }
}

// --- グローバルシステム環境 ---
var engine, ctx, canvas, ball, ballImg;
var cubes = [];
var light = new Vec3(0.5, -0.8, -0.2).normalize();
var rotX = 0, rotY = 0;

// クライアントごとの入力を集約するグローバル・セッション管理マップ
// 複数接続時にキー入力が衝突しないよう、キー入力を論理和(OR)等でマージ判定する基礎構造
var globalKeymap = []; 

var map = [
    { x: 25, y: 300, w: 25, h: 300, near: 0 },
    { x: 575, y: 300, w: 25, h: 300, near: 0 },
    { x: 300, y: 25, w: 250, h: 25, near: 1 },
    { x: 300, y: 575, w: 250, h: 25, near: 1 },
    { x: 250, y: 150, w: 200, h: 25, near: 1 },
    { x: 350, y: 300, w: 200, h: 25, near: 1 },
    { x: 250, y: 450, w: 200, h: 25, near: 1 },
];

// --- コアシミュレーションの初期化 ---
async function initSimulation() {
    canvas = createCanvas(600, 600);
    ctx = canvas.getContext('2d');

    try {
        ballImg = await loadImage(path.join(__dirname, 'ball.png'));
    } catch (e) {
        console.log("ball.png 未検出のため、スタンドアロン図形で描画します。");
        ballImg = null;
    }

    engine = new Engine(0, 0, 600, 600, 0, 0);

    map.forEach(function (c) {
        cubes.push(new Cube(c.x, c.y, 0, c.w, c.h, 25, c.near));
        var r = new RectangleEntity(c.x - c.w, c.y - c.h, c.w * 2, c.h * 2);
        engine.entities.push(r);
    });

    ball = new CircleEntity(100, 100, 30, BodyDynamic, 0.2);
    engine.entities.push(ball);

    // 定期的なシミュレーションの更新・描画ループ (25ms = 40fps)
    setInterval(tick, 25);
}

function tick() {
    if (globalKeymap[37]) { rotY -= 0.01; } // 左
    if (globalKeymap[39]) { rotY += 0.01; } // 右
    if (globalKeymap[38]) { rotX += 0.01; } // 上
    if (globalKeymap[40]) { rotX -= 0.01; } // 下
    rotX = Math.max(-0.1, Math.min(0.1, rotX));
    rotY = Math.max(-0.1, Math.min(0.1, rotY));
    
    engine.setGravity(-rotY * 20, rotX * 20);
    engine.step(0.01);

    var c = Math.cos(rotY), s = Math.sin(rotY);
    var MatrixRotY = [c, 0, s, 0, 1, 0, -s, 0, c];

    c = Math.cos(-rotX); s = Math.sin(-rotX);
    var MatrixRotX = [1, 0, 0, 0, c, -s, 0, s, c];

    cubes.forEach(function (b) {
        b.setCamera(300, -1000, 300, MatrixRotX, MatrixRotY);
    });

    paint();

    // 描画が完了したCanvasをBase64化し、接続中の全クライアントへブロードキャスト転送
    const dataUrl = canvas.toDataURL('image/png');
    io.emit('renderFrame', dataUrl);
}

function paint() {
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, 600, 600);

    var surfaces = [];
    cubes.forEach(function (b) { surfaces = surfaces.concat(b.getSurfaces()); });
    surfaces.sort((a, b) => b.cZ - a.cZ || Math.abs(b.cX) - Math.abs(a.cX));

    surfaces.forEach(function (s) {
        var p = (s.norm.x * light.x + s.norm.y * light.y + s.norm.z * light.z);
        var ratio = (p + 1) / 2;
        ctx.fillStyle = `rgba(${Math.floor(255 * ratio)},${Math.floor(255 * ratio)},${Math.floor(255 * ratio)},255)`;

        ctx.beginPath();
        for (var i = 0 ; i < 4 ; i++) {
            var v = s.pos[i];
            if (v.z <= 0) continue;
            var x = v.x / v.z * 1000 + 300;
            var y = -v.y / v.z * 1000 + 300;
            if (i == 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
    });

    if (ballImg) {
        ctx.drawImage(ballImg, ball.x - 30, ball.y - 30, 60, 60);
    } else {
        ctx.fillStyle = "#ff3333";
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, 30, 0, Math.PI * 2);
        ctx.fill();
    }
}

// --- Socket.IO 通信イベント制御 ---
io.on('connection', (socket) => {
    console.log(`クライアント接続成功: ${socket.id}`);

    // クライアントからのキー入力イベントを受信
    socket.on('keyInput', (data) => {
        // キーの状態をグローバルマップに反映
        globalKeymap[data.keyCode] = data.isPressed;
    });

    socket.on('disconnect', () => {
        console.log(`クライアント切断: ${socket.id}`);
        // 切断時にキー入力をクリア
        globalKeymap = [];
    });
});

// システム起動
server.listen(PORT, () => {
    console.log(`サーバーが起動しました。URL: http://localhost:${PORT}`);
    initSimulation();
});