// Top-down 90° character movement demo
(() => {
	const canvas = document.getElementById('game');
	const ctx = canvas.getContext('2d');

	// Setup canvas size to match CSS pixels
	function applyCanvasSize() {
		const style = getComputedStyle(canvas);
		const width = parseInt(style.width, 10);
		const height = parseInt(style.height, 10);
		// use devicePixelRatio for crisp rendering
		const dpr = window.devicePixelRatio || 1;
		canvas.width = Math.max(1, Math.floor(width * dpr));
		canvas.height = Math.max(1, Math.floor(height * dpr));
		canvas.style.width = width + 'px';
		canvas.style.height = height + 'px';
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
	}

	window.addEventListener('resize', applyCanvasSize);
	// initial
	applyCanvasSize();

	// Player state
	const player = {
		x: canvas.width / 2 / (window.devicePixelRatio || 1),
		y: canvas.height / 2 / (window.devicePixelRatio || 1),
		size: 22,
		speed: 180, // pixels per second
		angle: 0,
		walking: false,
		bob: 0
	};

	// Input
	const keys = { ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false, KeyW: false, KeyA: false, KeyS: false, KeyD: false };

	window.addEventListener('keydown', (e) => {
		if (e.code in keys) { keys[e.code] = true; e.preventDefault(); }
	}, { passive: false });
	window.addEventListener('keyup', (e) => { if (e.code in keys) { keys[e.code] = false; e.preventDefault(); } }, { passive: false });

	// helper: clamp
	function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

	// Game loop
	let last = performance.now();
	function loop(now) {
		const dt = Math.min(0.05, (now - last) / 1000);
		last = now;

		update(dt);
		render();
		requestAnimationFrame(loop);
	}

	function update(dt) {
		// compute input vector
		let dx = 0, dy = 0;
		if (keys.ArrowUp || keys.KeyW) dy -= 1;
		if (keys.ArrowDown || keys.KeyS) dy += 1;
		if (keys.ArrowLeft || keys.KeyA) dx -= 1;
		if (keys.ArrowRight || keys.KeyD) dx += 1;

		const moving = dx !== 0 || dy !== 0;
		player.walking = moving;

		if (moving) {
			// normalize so diagonal isn't faster
			const len = Math.hypot(dx, dy) || 1;
			dx /= len; dy /= len;
			// update angle: note canvas Y axis goes down, so angle as usual
			player.angle = Math.atan2(dy, dx);
			player.x += dx * player.speed * dt;
			player.y += dy * player.speed * dt;
			player.bob += dt * 12; // walking bob speed
		} else {
			// slowly damp bob when not walking
			player.bob *= 0.85;
		}

		// Keep inside canvas
		const w = canvas.width / (window.devicePixelRatio || 1);
		const h = canvas.height / (window.devicePixelRatio || 1);
		player.x = clamp(player.x, player.size + 4, w - player.size - 4);
		player.y = clamp(player.y, player.size + 4, h - player.size - 4);
	}

	function drawGrid() {
		const w = canvas.width / (window.devicePixelRatio || 1);
		const h = canvas.height / (window.devicePixelRatio || 1);
		ctx.save();
		ctx.lineWidth = 1;
		ctx.strokeStyle = 'rgba(255,255,255,0.03)';
		const gap = 32;
		for (let x = 0; x < w; x += gap) { ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, h); ctx.stroke(); }
		for (let y = 0; y < h; y += gap) { ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(w, y + 0.5); ctx.stroke(); }
		ctx.restore();
	}

	function render() {
		const w = canvas.width / (window.devicePixelRatio || 1);
		const h = canvas.height / (window.devicePixelRatio || 1);
		ctx.clearRect(0, 0, w, h);
		// background vignette
		const g = ctx.createLinearGradient(0, 0, 0, h);
		g.addColorStop(0, '#2a333b');
		g.addColorStop(1, '#1b2024');
		ctx.fillStyle = g;
		ctx.fillRect(0, 0, w, h);

		drawGrid();

		// draw player with simple body + facing triangle
		ctx.save();
		ctx.translate(player.x, player.y);

		// bobbing effect
		const bobOffset = Math.sin(player.bob) * (player.walking ? 3 : player.bob * 2);
		ctx.translate(0, bobOffset);

		// body
		ctx.beginPath();
		ctx.fillStyle = player.walking ? '#7ee6ff' : '#9fe8ff';
		ctx.arc(0, 0, player.size, 0, Math.PI * 2);
		ctx.fill();

		// facing triangle pointing to +X; rotate to player's angle
		ctx.rotate(player.angle);
		ctx.beginPath();
		ctx.fillStyle = '#092a33';
		ctx.moveTo(player.size + 2, 0);
		ctx.lineTo(player.size - 6, -8);
		ctx.lineTo(player.size - 6, 8);
		ctx.closePath();
		ctx.fill();

		// small eye/mark
		ctx.fillStyle = '#04282e';
		ctx.beginPath(); ctx.arc(player.size - 4, -4, 2.2, 0, Math.PI * 2); ctx.fill();
		ctx.restore();

		// HUD: coordinates
		ctx.fillStyle = 'rgba(255,255,255,0.8)';
		ctx.font = '13px Segoe UI, Roboto, Arial';
		ctx.fillText(`x: ${Math.round(player.x)}, y: ${Math.round(player.y)}`, 12, 20);
	}

	// ensure canvas focus on click so keyboard works
	canvas.addEventListener('click', () => canvas.focus());
	canvas.setAttribute('tabindex', '0');

	// kick off loop
	requestAnimationFrame(loop);

})();

