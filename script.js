// Top-down 90° character movement demo with a chasing enemy
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

	// Load Chingling sprite image
	const playerImage = new Image();
	playerImage.src = 'Chingling.png';
	let imageReady = false;
	playerImage.onload = () => { imageReady = true; };
	playerImage.onerror = () => { console.error('Falha ao carregar Chingling.png'); };

	// Load background image
	const bgImage = new Image();
	bgImage.src = 'BG.png';
	bgImage.onload = () => { console.log('Background loaded successfully'); };
	bgImage.onerror = () => { console.error('Falha ao carregar BG.png'); };

	// Load enemy image
	const enemyImage = new Image();
	enemyImage.src = 'enemy.png';
	enemyImage.onload = () => { console.log('Enemy image loaded successfully'); };
	enemyImage.onerror = () => { console.error('Falha ao carregar enemy.png'); };

	// Player state
	const player = {
		x: canvas.width / 2 / (window.devicePixelRatio || 1),
		y: canvas.height / 2 / (window.devicePixelRatio || 1),
		size: 22,
		speed: 180, // pixels per second
		angle: 0,
		vx: 0,
		vy: 0,
		accel: 14.0, // how quickly velocity approaches desired
		friction: 10.0, // how quickly velocity decays when no input
		rotationSpeed: 12.0, // how quickly facing rotates towards input direction (0..)
		lastInputX: 0,
		lastInputY: 0,
		walking: false,
		bob: 0,
		caught: false,
		caughtTimer: 0,
		isAttacking: false,
		attackTimer: 0,
		attackDuration: 0.3,
		attackAngle: 0, // direction player is attacking
		swordReach: 65,
		swordWidth: 12,
		attackId: 0,
		health: 100,
		maxHealth: 100,
		damageOnHit: 10,
		lastHitTimer: 0,
		hitCooldown: 0.5,
		invincibilityFrames: 0,
		invincibilityDuration: 1.2,
		knockbackTimer: 0,
		knockbackDuration: 0.2,
	};

	// Enemies array
	const enemies = [];
	function createEnemy(x, y) {
		return {
			x: x,
			y: y,
			size: 20,
			speed: 120,
			angle: 0,
			color: '#ff6b6b',
			alertColor: '#ff3b3b',
			pulse: 0,
			health: 20,
			maxHealth: 20,
			hitThisFrame: false,
			lastHitAttackId: -1
		};
	}
	
	// Spawn 3 initial enemies
	enemies.push(createEnemy(player.x + 140, player.y));
	enemies.push(createEnemy(player.x - 140, player.y + 100));
	enemies.push(createEnemy(player.x + 100, player.y - 120));

	// Enemy spawn timer
	let spawnTimer = 0;
	const spawnInterval = 1.5; // seconds

	// Spawn control
	let spawnEnabled = true; // toggle to stop spawning entirely
	const maxEnemies = 1000000; // maximum simultaneous enemies

	// Toggle collisions (player<->enemy and enemy separation). Set to false to disable collisions.
	let collisionsEnabled = true;

	// Game timer (seconds)
	let gameTime = 0;

	function formatTime(s) {
		const total = Math.max(0, Math.floor(s));
		const minutes = Math.floor(total / 60);
		const seconds = total % 60;
		return String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
	}

	// Input
	const keys = { ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false, KeyW: false, KeyA: false, KeyS: false, KeyD: false, Space: false };

	window.addEventListener('keydown', (e) => {
		if (e.code in keys) { keys[e.code] = true; e.preventDefault(); }
		if (e.code === 'Space' && !player.isAttacking && !player.caught) { 
			player.isAttacking = true; 
			player.attackTimer = player.attackDuration;
			player.attackAngle = player.angle; // Store the direction at attack start
			player.attackId++;
			e.preventDefault(); 
		}
	}, { passive: false });
	window.addEventListener('keyup', (e) => { if (e.code in keys) { keys[e.code] = false; e.preventDefault(); } }, { passive: false });

	// helper: clamp
	function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

	// linear interpolation
	function lerp(a, b, t) { return a + (b - a) * t; }

	// normalize angle to range [-PI, PI]
	function normalizeAngle(a) {
		while (a > Math.PI) a -= Math.PI * 2;
		while (a < -Math.PI) a += Math.PI * 2;
		return a;
	}

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
		// advance game timer if player still alive
		if (player.health > 0) gameTime += dt;
		
		// Decrement invincibility frames
		player.invincibilityFrames = Math.max(0, player.invincibilityFrames - dt);
		// debug: capture previous position to detect unexpected modifications
		const _prevPlayerX = player.x;
		const _prevPlayerY = player.y;

		// compute input vector
		let dx = 0, dy = 0;
		if (keys.ArrowUp || keys.KeyW) dy -= 1;
		if (keys.ArrowDown || keys.KeyS) dy += 1;
		if (keys.ArrowLeft || keys.KeyA) dx -= 1;
		if (keys.ArrowRight || keys.KeyD) dx += 1;

		// count directional keys pressed
		const dirKeys = [keys.ArrowUp, keys.KeyW, keys.ArrowDown, keys.KeyS, keys.ArrowLeft, keys.KeyA, keys.ArrowRight, keys.KeyD];
		const pressedCount = dirKeys.reduce((s, v) => s + (v ? 1 : 0), 0);

		// If many keys pressed and horizontal cancels out, prefer last known input
		if (pressedCount >= 3 && dx === 0 && dy === 0) {
			dx = player.lastInputX;
			dy = player.lastInputY;
		}

		const moving = dx !== 0 || dy !== 0;
		player.walking = moving;

		// If player is knocked back, ignore movement input until knockback ends
		if (player.knockbackTimer <= 0) {
			if (moving && !player.caught) {
				const len = Math.hypot(dx, dy) || 1;
				dx /= len; dy /= len;
				// Update position directly with smooth movement
				player.x += dx * player.speed * dt;
				player.y += dy * player.speed * dt;
				// remember last input direction
				player.lastInputX = dx;
				player.lastInputY = dy;
				// Update angle to face direction
				player.angle = Math.atan2(dy, dx);
			}
		} else {
			// still in knockback: decrement timer (knockback movement handled via vx/vy below)
			player.knockbackTimer = Math.max(0, player.knockbackTimer - dt);
		}

		// apply velocity bobbing effect
		if (moving) {
			player.bob += dt * 12;
		} else {
			player.bob *= 0.85;
		}

		// apply velocity to position (includes knockback)
		player.x += player.vx * dt;
		player.y += player.vy * dt;

		// If knockback just ended, zero out velocities so movement can resume cleanly
		if (player.knockbackTimer <= 0 && (Math.abs(player.vx) > 0 || Math.abs(player.vy) > 0)) {
			// only zero velocities if they were from knockback (we don't track source precisely,
			// but when knockbackTimer is 0 it's safe to clear lingering impulse)
			player.vx = 0;
			player.vy = 0;
		}

		// bobbing scales with movement speed
		const speedFactor = Math.hypot(player.vx, player.vy) / (player.speed || 1);
		if (speedFactor > 0.01) {
			player.bob += dt * 12 * speedFactor;
		} else {
			player.bob *= 0.85;
		}

		// Enemy AI and collision check for all enemies
		for (let i = 0; i < enemies.length; i++) {
			const enemy = enemies[i];
			if (enemy.health <= 0) continue;
			
			// Calculate direction to player
			const toPlayerX = player.x - enemy.x;
			const toPlayerY = player.y - enemy.y;
			const distToPlayer = Math.hypot(toPlayerX, toPlayerY);
			
			// Always move toward player first
			let moveX = 0;
			let moveY = 0;
			
			if (distToPlayer > 0.1) {
				moveX = toPlayerX / distToPlayer;
				moveY = toPlayerY / distToPlayer;
			}
			
			// Very light separation: only prevent direct collision stacking
			let pushX = 0;
			let pushY = 0;
			let pushCount = 0;
			
			for (let j = 0; j < enemies.length; j++) {
				if (i === j) continue;
				const other = enemies[j];
				if (other.health <= 0) continue;
				
				const dx = enemy.x - other.x;
				const dy = enemy.y - other.y;
				const distToOther = Math.hypot(dx, dy);
				
				// Only separate if nearly touching
				const minDist = enemy.size * 2.2;
				if (distToOther > 0.1 && distToOther < minDist) {
					// Gentle push away
					pushX += (dx / distToOther);
					pushY += (dy / distToOther);
					pushCount++;
				}
			}
			
			// Apply minimal push - only 5% influence to avoid disrupting pursuit
			if (pushCount > 0) {
				pushX /= pushCount;
				pushY /= pushCount;
				const pushLen = Math.hypot(pushX, pushY);
				if (pushLen > 0.1) {
					pushX = (pushX / pushLen) * 0.05;
					pushY = (pushY / pushLen) * 0.05;
					moveX += pushX;
					moveY += pushY;
				}
			}
			
			// Always ensure we have a valid direction
			const finalLen = Math.hypot(moveX, moveY);
			if (finalLen > 0.1) {
				moveX /= finalLen;
				moveY /= finalLen;
			} else if (distToPlayer > 0.1) {
				// Fallback to pure pursuit if movement became zero
				moveX = toPlayerX / distToPlayer;
				moveY = toPlayerY / distToPlayer;
			}
			
			// Update position
			enemy.x += moveX * enemy.speed * dt;
			enemy.y += moveY * enemy.speed * dt;
			
			// Update angle to face direction of movement
			enemy.angle = Math.atan2(moveY, moveX);
			enemy.pulse += dt * 6;

			// Collision check and damage with knockback
			const minCollideDist = player.size + enemy.size - 2;
			if (distToPlayer < minCollideDist && enemy.health > 0) {
				// Only take damage if not in invincibility frames
				if (player.invincibilityFrames <= 0) {
					// Apply damage to player
					player.health -= player.damageOnHit;
					if (player.health < 0) player.health = 0;
					
					// Start invincibility frames
					player.invincibilityFrames = player.invincibilityDuration;
					
					// Strong knockback player away from enemy
					if (distToPlayer > 0) {
						const knockbackDir = Math.atan2(toPlayerY, toPlayerX);
						const knockbackForce = 200; // increased from 100
						player.vx = Math.cos(knockbackDir) * knockbackForce;
						player.vy = Math.sin(knockbackDir) * knockbackForce;
						player.knockbackTimer = player.knockbackDuration;
					}
				}
			}

			// Keep enemy inside canvas
			const w = canvas.width / (window.devicePixelRatio || 1);
			const h = canvas.height / (window.devicePixelRatio || 1);
			enemy.x = clamp(enemy.x, enemy.size + 4, w - enemy.size - 4);
			enemy.y = clamp(enemy.y, enemy.size + 4, h - enemy.size - 4);
		}

		// Remove dead enemies from the array to avoid unbounded growth
		for (let i = enemies.length - 1; i >= 0; i--) {
			if (enemies[i].health <= 0) {
				enemies.splice(i, 1);
			}
		}

		if (player.caught) {
			player.caughtTimer -= dt;
			if (player.caughtTimer <= 0) { player.caught = false; player.caughtTimer = 0; }
		}

		// Attack logic
		if (player.isAttacking) {
			player.attackTimer -= dt;
			if (player.attackTimer <= 0) {
				player.isAttacking = false;
			}
		}

		// Check if player's sword hits any enemy.
		// Compute current swing offset so hit detection matches the visual sword
		// and so the player can change facing mid-swing.
		let swingOffset = 0;
		if (player.isAttacking) {
			const swingProgress = 1 - (player.attackTimer / player.attackDuration);
			swingOffset = (swingProgress - 0.5) * Math.PI * 0.9;
		}

		// Save player's position and restore after hit processing to avoid
		// accidental modifications during knockback/hit logic.
		const _savedPlayerX = player.x;
		const _savedPlayerY = player.y;

		for (let enemy of enemies) {
			const ex = enemy.x - player.x;
			const ey = enemy.y - player.y;
			const edist = Math.hypot(ex, ey);
			const enormAngle = Math.atan2(ey, ex);

			// Use the attack angle plus the swing offset for hit tests
			const effectiveAngle = player.attackAngle + swingOffset;
			let angleDiff = Math.abs(effectiveAngle - enormAngle);
			const normalizedDiff = Math.min(angleDiff, Math.PI * 2 - angleDiff);

			const swordMinReach = player.size * 0.5;
			const swordMaxReach = player.size + player.swordReach + 10;

			// Only knockback and damage if actively attacking
			if (player.isAttacking && edist >= swordMinReach && edist < swordMaxReach && normalizedDiff < Math.PI * 0.4) {
				// Knockback enemy along the effective swing direction
				const knockbackForce = 150;
				enemy.x += Math.cos(effectiveAngle) * knockbackForce * dt;
				enemy.y += Math.sin(effectiveAngle) * knockbackForce * dt;

				// Damage enemy only once per attack (using attackId)
				if (enemy.lastHitAttackId !== player.attackId) {
					enemy.health -= 10;
					enemy.lastHitAttackId = player.attackId;
					if (enemy.health < 0) enemy.health = 0;
					console.log('Hit! Enemy HP:', enemy.health);
				}
			}

		// Restore player position in case any logic accidentally modified it.
		player.x = _savedPlayerX;
		player.y = _savedPlayerY;
		}

		// Keep inside canvas boundaries
		const w = canvas.width / (window.devicePixelRatio || 1);
		const h = canvas.height / (window.devicePixelRatio || 1);
		player.x = clamp(player.x, player.size + 4, w - player.size - 4);
		player.y = clamp(player.y, player.size + 4, h - player.size - 4);

		// Controlled enemy spawning: spawn at fixed interval up to maxEnemies
		if (spawnEnabled) {
			spawnTimer += dt;
			let activeCount = enemies.reduce((s, e) => s + (e.health > 0 ? 1 : 0), 0);
			// safety cap for total array size to avoid runaway memory growth
			const maxTotalEnemies = Math.max(100, maxEnemies * 4);
			// spawn while there's accumulated time (handles lag) but limit spawns per frame
			let spawnsThisFrame = 0;
			while (spawnTimer >= spawnInterval && spawnsThisFrame < 3) {
				spawnTimer -= spawnInterval;
				spawnsThisFrame++;
				if (activeCount >= maxEnemies) break; // respect active enemy cap
				if (enemies.length >= maxTotalEnemies) break; // safety total cap
				// spawn at a random edge position, away from player
				const margin = 40;
				const edge = Math.floor(Math.random() * 4);
				let sx = margin, sy = margin;
				if (edge === 0) { // top
					sx = Math.random() * (w - margin * 2) + margin; sy = -20 + margin; }
				else if (edge === 1) { // right
					sx = w + 20 - margin; sy = Math.random() * (h - margin * 2) + margin; }
				else if (edge === 2) { // bottom
					sx = Math.random() * (w - margin * 2) + margin; sy = h + 20 - margin; }
				else { // left
					sx = -20 + margin; sy = Math.random() * (h - margin * 2) + margin; }
				enemies.push(createEnemy(sx, sy));
				activeCount++;
			}
		}
	}

	function drawChingling() {
		// Draw Chingling image if loaded, otherwise draw fallback
		if (imageReady) {
			const size = player.size * 2.2;
			ctx.drawImage(playerImage, -size / 2, -size / 2, size, size);
		} else {
			// Fallback: simple white circle
			ctx.beginPath();
			ctx.fillStyle = '#ffffff';
			ctx.arc(0, 0, 16, 0, Math.PI * 2);
			ctx.fill();
			ctx.strokeStyle = '#cccccc';
			ctx.lineWidth = 2;
			ctx.stroke();
		}
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
		
		// Draw background image if loaded, otherwise draw fallback gradient
		if (bgImage.complete) {
			ctx.drawImage(bgImage, 0, 0, w, h);
		} else {
			// fallback gradient background
			const g = ctx.createLinearGradient(0, 0, 0, h);
			g.addColorStop(0, '#2a333b');
			g.addColorStop(1, '#1b2024');
			ctx.fillStyle = g;
			ctx.fillRect(0, 0, w, h);
		}

		drawGrid();

		// draw all enemies (behind player) - only if alive
		for (let enemy of enemies) {
			if (enemy.health > 0) {
				ctx.save();
				ctx.translate(enemy.x, enemy.y);
				ctx.rotate(enemy.angle);
				// pulse when near
				const pulse = 1 + Math.sin(enemy.pulse) * 0.04;
				
				// Draw enemy image if loaded, otherwise draw fallback circle
				if (enemyImage.complete) {
					const size = enemy.size * 2.2 * pulse;
					ctx.drawImage(enemyImage, -size / 2, -size / 2, size, size);
				} else {
					// Fallback: red circle
					ctx.beginPath();
					const ec = player.caught ? enemy.alertColor : enemy.color;
					ctx.fillStyle = ec;
					ctx.arc(0, 0, enemy.size * pulse, 0, Math.PI * 2);
					ctx.fill();
					// eye/mark
					ctx.fillStyle = '#2b0b0b';
					ctx.beginPath(); ctx.arc(enemy.size - 6, -4, 3, 0, Math.PI * 2); ctx.fill();
				}
				ctx.restore();
			}
		}

		// draw player (Chingling) with rotation and effects
		ctx.save();
		
		// Flash effect during invincibility frames
		if (player.invincibilityFrames > 0) {
			// Blink every 0.15 seconds
			const blinkPhase = (player.invincibilityFrames / 0.15) % 2;
			if (blinkPhase < 1) {
				// Invisible half the time
				ctx.globalAlpha = 0.3;
			}
		}
		
		ctx.translate(player.x, player.y);

		// bobbing effect
		const bobOffset = Math.sin(player.bob) * (player.walking ? 2.5 : player.bob * 1.5);
		ctx.translate(0, bobOffset);

		// Tilt effect based on direction when walking
		if (player.walking) {
			ctx.rotate(Math.sin(player.bob) * 0.1);
		}

		// Rotate towards facing direction or attack direction if attacking
		const displayAngle = player.isAttacking ? player.attackAngle : player.angle;
		ctx.rotate(displayAngle);

		// Draw Chingling sprite
		drawChingling();

		// Draw sword if attacking (rotated in swing arc)
		if (player.isAttacking) {
			const swingProgress = 1 - (player.attackTimer / player.attackDuration);
			const swingAngle = (swingProgress - 0.5) * Math.PI * 0.9;
			ctx.save();
			ctx.rotate(swingAngle);
			ctx.strokeStyle = '#ffffff';
			ctx.lineWidth = player.swordWidth;
			ctx.lineCap = 'round';
			ctx.beginPath();
			ctx.moveTo(player.size * 0.7, 0);
			ctx.lineTo(player.size + player.swordReach, 0);
			ctx.stroke();
			ctx.restore();
		}
		ctx.restore();

		// HUD: coordinates + health + caught state
		ctx.fillStyle = 'rgba(255,255,255,0.9)';
		ctx.font = '13px Segoe UI, Roboto, Arial';
		// draw top-center game timer
		ctx.textAlign = 'center';
		ctx.fillText(formatTime(gameTime), w / 2, 20);
		ctx.textAlign = 'left';
		ctx.fillText(`x: ${Math.round(player.x)}, y: ${Math.round(player.y)}`, 12, 40);
		
		// Health bar
		const healthBarWidth = 150;
		const healthBarHeight = 16;
		const healthBarX = 12;
		const healthBarY = 32;
		ctx.fillStyle = 'rgba(0,0,0,0.5)';
		ctx.fillRect(healthBarX, healthBarY, healthBarWidth, healthBarHeight);
		const healthPercent = player.health / player.maxHealth;
		const healthColor = healthPercent > 0.5 ? '#4ade80' : healthPercent > 0.2 ? '#facc15' : '#ef4444';
		ctx.fillStyle = healthColor;
		ctx.fillRect(healthBarX + 2, healthBarY + 2, (healthBarWidth - 4) * healthPercent, healthBarHeight - 4);
		ctx.strokeStyle = 'rgba(255,255,255,0.6)';
		ctx.lineWidth = 1;
		ctx.strokeRect(healthBarX, healthBarY, healthBarWidth, healthBarHeight);
		ctx.fillStyle = 'rgba(255,255,255,0.9)';
		ctx.font = 'bold 11px Segoe UI, Roboto, Arial';
		ctx.fillText(`HP: ${Math.max(0, player.health)}/${player.maxHealth}`, healthBarX + 5, healthBarY + 12);
		
		if (player.caught) {
			ctx.fillStyle = 'rgba(255,90,90,0.95)';
			ctx.font = '16px Segoe UI, Roboto, Arial';
			ctx.fillText('PEGO!', 12, 62);
		}
		
		// Enemy health bar (top right)
		// Removed - health bar no longer displayed
		
		// Game Over
		if (player.health <= 0) {
			ctx.fillStyle = 'rgba(0,0,0,0.7)';
			ctx.fillRect(0, 0, w, h);
			ctx.fillStyle = '#ff4444';
			ctx.font = 'bold 48px Segoe UI, Roboto, Arial';
			ctx.textAlign = 'center';
			ctx.fillText('GAME OVER', w / 2, h / 2 - 20);
			ctx.fillStyle = 'rgba(255,255,255,0.9)';
			ctx.font = '18px Segoe UI, Roboto, Arial';
			ctx.fillText('Recarregue a página para tentar novamente', w / 2, h / 2 + 30);
			ctx.textAlign = 'left';
		}
	}

	// ensure canvas focus on click so keyboard works
	canvas.addEventListener('click', () => canvas.focus());
	canvas.setAttribute('tabindex', '0');

	// kick off loop
	requestAnimationFrame(loop);

})();

