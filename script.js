// Top-down 90° character movement demo with a chasing enemy
(() => {
	const canvas = document.getElementById('game');
	const ctx = canvas.getContext('2d');
	const main = document.querySelector('main');
	const fullscreenBtn = document.getElementById('fullscreen-btn');

	// Fullscreen toggle function
	function toggleFullscreen() {
		if (!document.fullscreenElement) {
			main.requestFullscreen().catch(err => console.error(`Error attempting to enable fullscreen: ${err.message}`));
		} else {
			document.exitFullscreen();
		}
	}

	// Fullscreen button click event
	fullscreenBtn.addEventListener('click', toggleFullscreen);

	// Update button text on fullscreen change
	document.addEventListener('fullscreenchange', () => {
		fullscreenBtn.textContent = document.fullscreenElement ? '⛶' : '⛶';
	});

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
	playerImage.src = 'player.png';
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

	// Character definitions (scalable system)
	const characterTypes = {
		parry: {
			name: "Defender",
			description: "Right-click to parry\nand reflect projectiles",
			color: '#4ade80',
			hasParry: true,
			hasProjectile: false,
			projectileSpeed: 0,
			projectileDamage: 0,
			projectileCooldown: 0
		},
		shooter: {
			name: "Ranger",
			description: "Right-click to shoot\nprojectiles at enemies",
			color: '#facc15',
			hasParry: false,
			hasProjectile: true,
			projectileSpeed: 600,
			projectileDamage: 20,
			projectileCooldown: 1.0
		}
		// More characters can be added here easily
	};

	// Game state
	let characterSelected = null;
	let characterSelectionActive = true;

	// Player state
	const player = {
		x: canvas.width / 2 / (window.devicePixelRatio || 1),
		y: canvas.height / 2 / (window.devicePixelRatio || 1),
		size: 22,
		speed: 150, // pixels per second
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
		kills: 0,
		level: 1,
		xp: 0,
		xpToNextLevel: 10,
		isParrying: false,
		parryTimer: 0,
		parryDuration: 0.3,
		parryCooldown: 0,
		parryMaxCooldown: 3.0,
		parryAngle: 0,
		// Projectile shooting
		shootCooldown: 0,
		shootMaxCooldown: 0.5,
		// Dash mechanic
		isDashing: false,
		dashTimer: 0,
		dashDuration: 0.2,
		dashSpeed: 800,
		dashCooldown: 0,
		dashMaxCooldown: 1.0,
		dashDirection: { x: 0, y: 0 }
	};

	// Upgrade system
	let upgradePending = false;
	let gamePaused = false;

	function levelUp() {
		player.level++;
		player.xp = 0;
		player.xpToNextLevel = Math.floor(10 + player.level * 2.5); // 10, 13, 16, 19, 23...
		upgradePending = true;
		gamePaused = true;
	}

	function selectUpgrade(type) {
		if (type === 'speed') {
			player.speed += 20;
		} else if (type === 'attackSpeed') {
			player.attackDuration = Math.max(0.1, player.attackDuration - 0.03);
		} else if (type === 'health') {
			player.maxHealth += 20;
			player.health = player.maxHealth; // heal to full
		}
		upgradePending = false;
		gamePaused = false;
	}

	// Mouse tracking
	const mouse = {
		x: canvas.width / 2 / (window.devicePixelRatio || 1),
		y: canvas.height / 2 / (window.devicePixelRatio || 1)
	};

	// Enemies array
	const enemies = [];
	
	// Shockwaves array for visual effects
	const shockwaves = [];
	function createShockwave(x, y) {
		return {
			x: x,
			y: y,
			radius: 0,
			maxRadius: 300,
			age: 0,
			lifetime: 1.0
		};
	}
	function createEnemy(x, y, type = 'melee') {
		if (type === 'boss') {
			return {
				x: x,
				y: y,
				size: 40,
				speed: 80,
				angle: 0,
				color: '#ff0000',
				alertColor: '#cc0000',
				pulse: 0,
				health: 200,
				maxHealth: 200,
				hitThisFrame: false,
				lastHitAttackId: -1,
				lastHitDashId: -1,
				type: 'boss',
				isAttacking: false,
				isTelegraphing: false,
				telegraphTimer: 0,
				telegraphDuration: 0.5,
				attackTimer: 0,
				attackDuration: 0.4,
				attackAngle: 0,
				swordReach: 80,
				swordWidth: 14,
				attackCooldown: 0,
				attackMaxCooldown: 2.0,
				attackId: 0
			};
		}
		if (type === 'shooter') {
			return {
				x: x,
				y: y,
				size: 18,
				speed: 80,
				angle: 0,
				color: '#9b59b6',
				alertColor: '#8e44ad',
				pulse: 0,
				health: 15,
				maxHealth: 15,
				hitThisFrame: false,
				lastHitAttackId: -1,
				lastHitDashId: -1,
				type: 'shooter',
				shootTimer: 0,
				shootCooldown: 2.5,
				optimalDistance: 250
			};
		}
		if (type === 'scout') {
			return {
				x: x,
				y: y,
				size: 14,
				speed: 240,
				angle: 0,
				color: '#5de3ff',
				alertColor: '#3cc5e0',
				pulse: 0,
				health: 8,
				maxHealth: 8,
				hitThisFrame: false,
				lastHitAttackId: -1,
				lastHitDashId: -1,
				type: 'scout'
			};
		}
		return {
			x: x,
			y: y,
			size: 20,
			speed: 150,
			angle: 0,
			color: '#ff6b6b',
			alertColor: '#ff3b3b',
			pulse: 0,
			health: 20,
			maxHealth: 20,
			hitThisFrame: false,
			lastHitAttackId: -1,
			lastHitDashId: -1,
			type: 'melee'
		};
	}

	// Projectiles array
	const projectiles = [];
	function createProjectile(x, y, angle, speed = 900) {
		return {
			x: x,
			y: y,
			angle: angle,
			speed: speed,
			size: 6,
			damage: 15,
			lifetime: 3,
			age: 0,
			friendly: false // reflected by player sword when true
		};
	}
	
	// Activatable types (temporary buffs or instant use)
	const activatableTypes = {
		swingProjectile: {
			name: 'Swing Shot',
			color: '#ff6b6b',
			duration: 10,
			description: 'Shoot projectile with each swing',
			type: 'buff'
		},
		halfCooldown: {
			name: 'Swift Strike',
			color: '#ffd93d',
			duration: 12,
			description: 'Halved ability cooldown',
			type: 'buff'
		},
		piercingShot: {
			name: 'Piercing Blast',
			color: '#6bcf7f',
			description: 'Fire a powerful piercing shot',
			type: 'instant'
		}
	};
	
	// Player inventory for activatable
	let storedActivatable = null;
	
	// Activatables array (dropped items)
	const activatables = [];
	function createActivatable(x, y, type) {
		return {
			x: x,
			y: y,
			type: type,
			size: 10,
			pulse: 0,
			lifetime: 15, // despawn after 15 seconds
			age: 0
		};
	}
	
	// Active buffs
	const activeBuffs = [];
	function activateBuff(type) {
		const buffDef = activatableTypes[type];
		// Check if this buff is already active
		const existing = activeBuffs.find(b => b.type === type);
		if (existing) {
			// Refresh duration
			existing.timer = buffDef.duration;
		} else {
			// Add new buff
			activeBuffs.push({
				type: type,
				timer: buffDef.duration
			});
		}
	}
	
	function useActivatable() {
		if (!storedActivatable || player.health <= 0) return;
		
		const itemDef = activatableTypes[storedActivatable];
		
		if (itemDef.type === 'buff') {
			// Activate as a buff
			activateBuff(storedActivatable);
		} else if (itemDef.type === 'instant') {
			// Instant use - piercing shot
			if (storedActivatable === 'piercingShot') {
				// Fire powerful piercing projectile toward mouse
				const dx = mouse.x - player.x;
				const dy = mouse.y - player.y;
				const angle = Math.atan2(dy, dx);
				
				projectiles.push({
					x: player.x + Math.cos(angle) * player.size,
					y: player.y + Math.sin(angle) * player.size,
					angle: angle,
					speed: 700,
					size: 10,
					damage: 30,
					lifetime: 4,
					age: 0,
					friendly: true,
					color: itemDef.color,
					pierce: true,
					hitEnemies: [] // Track which enemies have been hit
				});
			}
		}
		
		// Clear stored activatable after use
		storedActivatable = null;
	}
	
	// Enemy spawn timer
	let spawnTimer = 0;
	const spawnInterval = 1; // seconds

	// Spawn control
	let spawnEnabled = true; // toggle to stop spawning entirely
	const maxEnemies = 1000000; // maximum simultaneous enemies

	// Boss spawn control
	let bossSpawned = false;
	const bossSpawnTime = 5; // spawn boss at 60 seconds
	
	// Permanent upgrades pool (scalable system)
	const permanentUpgradePool = {
		dashPlus: {
			name: 'Dash+',
			description: 'Dash deals damage\n-20% dash cooldown',
			color: '#00d4ff',
			apply: () => {
				player.dashDealsdamage = true;
				player.dashMaxCooldown *= 0.80; // Reduce by 20%
			}
		},
		explosiveShots: {
			name: 'Explosive Shots',
			description: 'Projectiles explode on hit\n(Stacks: +dmg +radius)',
			color: '#ff6b35',
			apply: () => {
				playerUpgrades.explosiveShotsStacks++;
			}
		}
		// More items can be added here
	};
	
	// Player permanent upgrades
	const playerUpgrades = {
		dashDealsdamage: false,
		explosiveShotsStacks: 0
	};
	
	// Safe room state
	let inSafeRoom = false;
	let hasHealed = false;
	let selectedItem = null;
	const healingStation = { x: 0, y: 0, size: 30, active: true };
	const pressurePlate = { x: 0, y: 0, size: 40, active: false };
	const itemChoices = [
		{ x: 0, y: 0, size: 50, type: '', name: '', description: '', color: '#ff6b6b' },
		{ x: 0, y: 0, size: 50, type: '', name: '', description: '', color: '#4ecdc4' },
		{ x: 0, y: 0, size: 50, type: '', name: '', description: '', color: '#ffe66d' }
	];

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
	const keys = { ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false, KeyW: false, KeyA: false, KeyS: false, KeyD: false, Space: false, KeyF: false };

	window.addEventListener('keydown', (e) => {
		if (e.code in keys) { keys[e.code] = true; e.preventDefault(); }
		// F key to activate stored item (only if not in character selection or upgrade screen)
		if (e.code === 'KeyF' && !characterSelectionActive && !gamePaused && storedActivatable) {
			useActivatable();
			e.preventDefault();
		}
	}, { passive: false });
	window.addEventListener('keyup', (e) => { if (e.code in keys) { keys[e.code] = false; e.preventDefault(); } }, { passive: false });

	// Mouse move event to track mouse position
	canvas.addEventListener('mousemove', (e) => {
		const rect = canvas.getBoundingClientRect();
		mouse.x = e.clientX - rect.left;
		mouse.y = e.clientY - rect.top;
	});
	
	// Prevent context menu on right-click
	canvas.addEventListener('contextmenu', (e) => {
		e.preventDefault();
	});

	// Left click to attack in direction of mouse
	canvas.addEventListener('mousedown', (e) => {
		// Character selection
		if (characterSelectionActive) {
			const rect = canvas.getBoundingClientRect();
			const clickX = e.clientX - rect.left;
			const clickY = e.clientY - rect.top;
			
			const w = canvas.width / (window.devicePixelRatio || 1);
			const h = canvas.height / (window.devicePixelRatio || 1);
			
			const buttonWidth = 250;
			const buttonHeight = 180;
			const buttonGap = 40;
			
			const characters = Object.keys(characterTypes);
			const totalWidth = buttonWidth * characters.length + buttonGap * (characters.length - 1);
			const startX = (w - totalWidth) / 2;
			const buttonY = h / 2 - 40;
			
			// Check which character button was clicked
			if (clickY >= buttonY && clickY <= buttonY + buttonHeight) {
				characters.forEach((charKey, index) => {
					const x = startX + (buttonWidth + buttonGap) * index;
					if (clickX >= x && clickX < x + buttonWidth) {
						characterSelected = charKey;
						characterSelectionActive = false;
						
						// Configure player based on character
						const char = characterTypes[charKey];
						player.shootMaxCooldown = char.projectileCooldown;
					}
				});
			}
			e.preventDefault();
			return;
		}
		
		if (gamePaused && upgradePending) {
			// Handle upgrade selection
			const rect = canvas.getBoundingClientRect();
			const clickX = e.clientX - rect.left;
			const clickY = e.clientY - rect.top;
			
			const w = canvas.width / (window.devicePixelRatio || 1);
			const h = canvas.height / (window.devicePixelRatio || 1);
			
			const buttonWidth = 200;
			const buttonHeight = 80;
			const buttonGap = 20;
			const totalWidth = buttonWidth * 3 + buttonGap * 2;
			const startX = (w - totalWidth) / 2;
			const buttonY = h / 2 + 40;
			
			// Check which button was clicked
			if (clickY >= buttonY && clickY <= buttonY + buttonHeight) {
				if (clickX >= startX && clickX < startX + buttonWidth) {
					selectUpgrade('speed');
				} else if (clickX >= startX + buttonWidth + buttonGap && clickX < startX + buttonWidth * 2 + buttonGap) {
					selectUpgrade('attackSpeed');
				} else if (clickX >= startX + buttonWidth * 2 + buttonGap * 2 && clickX < startX + buttonWidth * 3 + buttonGap * 2) {
					selectUpgrade('health');
				}
			}
			e.preventDefault();
			return;
		}
		
		if (e.button === 0 && !player.isAttacking && !player.caught && player.health > 0) {
			player.isAttacking = true;
			player.attackTimer = player.attackDuration;
			// Attack in direction of mouse
			const dx = mouse.x - player.x;
			const dy = mouse.y - player.y;
			player.attackAngle = Math.atan2(dy, dx);
			player.attackId++;
			
			// Swing Projectile buff: shoot projectile with each swing
			if (activeBuffs.find(b => b.type === 'swingProjectile')) {
				projectiles.push({
					x: player.x + Math.cos(player.attackAngle) * player.size,
					y: player.y + Math.sin(player.attackAngle) * player.size,
					angle: player.attackAngle,
					speed: 500,
					size: 6,
					damage: 15,
					lifetime: 3,
					age: 0,
					friendly: true,
					color: '#ff6b6b'
				});
			}
			
			e.preventDefault();
		}
		
		// Right-click ability (character-specific)
		if (e.button === 2 && !player.caught && player.health > 0) {
			const char = characterTypes[characterSelected];
			
			// Parry ability
			if (char.hasParry && !player.isParrying && player.parryCooldown <= 0) {
				player.isParrying = true;
				player.parryTimer = player.parryDuration;
				e.preventDefault();
			}
			
			// Projectile ability
			if (char.hasProjectile && player.shootCooldown <= 0) {
				const dx = mouse.x - player.x;
				const dy = mouse.y - player.y;
				const angle = Math.atan2(dy, dx);
				
				// Create player projectile
				projectiles.push({
					x: player.x + Math.cos(angle) * player.size,
					y: player.y + Math.sin(angle) * player.size,
					angle: angle,
					speed: char.projectileSpeed,
					size: 5,
					damage: char.projectileDamage,
					lifetime: 3,
					age: 0,
					friendly: true,
					color: char.color
				});
				
				// Apply cooldown (halved if buff active)
				const cooldownMultiplier = activeBuffs.find(b => b.type === 'halfCooldown') ? 0.5 : 1.0;
				player.shootCooldown = player.shootMaxCooldown * cooldownMultiplier;
				e.preventDefault();
			}
		}
	});

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

	// Upgrade screen drawing
	function drawUpgradeScreen() {
		const w = canvas.width / (window.devicePixelRatio || 1);
		const h = canvas.height / (window.devicePixelRatio || 1);
		
		// Dark overlay
		ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
		ctx.fillRect(0, 0, w, h);
		
		// Title
		ctx.fillStyle = '#6ad0ff';
		ctx.font = 'bold 48px Segoe UI, Roboto, Arial';
		ctx.textAlign = 'center';
		ctx.fillText(`LEVEL ${player.level}!`, w / 2, h / 2 - 60);
		
		ctx.fillStyle = 'rgba(255,255,255,0.9)';
		ctx.font = '24px Segoe UI, Roboto, Arial';
		ctx.fillText('Choose an Upgrade:', w / 2, h / 2 - 10);
		
		// Draw three upgrade buttons
		const buttonWidth = 200;
		const buttonHeight = 80;
		const buttonGap = 20;
		const totalWidth = buttonWidth * 3 + buttonGap * 2;
		const startX = (w - totalWidth) / 2;
		const buttonY = h / 2 + 40;
		
		// Speed button
		drawUpgradeButton(startX, buttonY, buttonWidth, buttonHeight, 'SPEED', `+20 Speed\nCurrent: ${Math.round(player.speed)}`, '#4ade80');
		
		// Attack Speed button
		drawUpgradeButton(startX + buttonWidth + buttonGap, buttonY, buttonWidth, buttonHeight, 'ATTACK SPEED', `-0.03s Attack\nCurrent: ${player.attackDuration.toFixed(2)}s`, '#facc15');
		
		// Health button
		drawUpgradeButton(startX + buttonWidth * 2 + buttonGap * 2, buttonY, buttonWidth, buttonHeight, 'HEALTH', `+20 Max HP\nHeal to Full\nCurrent: ${player.maxHealth}`, '#ef4444');
		
		ctx.textAlign = 'left';
	}
	
	function drawUpgradeButton(x, y, width, height, title, description, color) {
		// Button background
		ctx.fillStyle = 'rgba(255,255,255,0.1)';
		ctx.fillRect(x, y, width, height);
		
		// Button border
		ctx.strokeStyle = color;
		ctx.lineWidth = 3;
		ctx.strokeRect(x, y, width, height);
		
		// Title
		ctx.fillStyle = color;
		ctx.font = 'bold 18px Segoe UI, Roboto, Arial';
		ctx.textAlign = 'center';
		ctx.fillText(title, x + width / 2, y + 25);
		
		// Description
		ctx.fillStyle = 'rgba(255,255,255,0.8)';
		ctx.font = '13px Segoe UI, Roboto, Arial';
		const lines = description.split('\n');
		let offsetY = y + 45;
		for (const line of lines) {
			ctx.fillText(line, x + width / 2, offsetY);
			offsetY += 16;
		}
	}

	// Character selection screen
	function drawCharacterSelection() {
		const w = canvas.width / (window.devicePixelRatio || 1);
		const h = canvas.height / (window.devicePixelRatio || 1);
		
		// Background
		ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
		ctx.fillRect(0, 0, w, h);
		
		// Title
		ctx.fillStyle = '#6ad0ff';
		ctx.font = 'bold 56px Segoe UI, Roboto, Arial';
		ctx.textAlign = 'center';
		ctx.fillText('SELECT YOUR CHARACTER', w / 2, h / 2 - 120);
		
		// Draw character buttons
		const buttonWidth = 250;
		const buttonHeight = 180;
		const buttonGap = 40;
		
		const characters = Object.keys(characterTypes);
		const totalWidth = buttonWidth * characters.length + buttonGap * (characters.length - 1);
		const startX = (w - totalWidth) / 2;
		const buttonY = h / 2 - 40;
		
		characters.forEach((charKey, index) => {
			const char = characterTypes[charKey];
			const x = startX + (buttonWidth + buttonGap) * index;
			drawCharacterButton(x, buttonY, buttonWidth, buttonHeight, char.name, char.description, char.color);
		});
		
		ctx.textAlign = 'left';
	}
	
	function drawCharacterButton(x, y, width, height, title, description, color) {
		// Button background
		ctx.fillStyle = 'rgba(255,255,255,0.05)';
		ctx.fillRect(x, y, width, height);
		
		// Button border
		ctx.strokeStyle = color;
		ctx.lineWidth = 4;
		ctx.strokeRect(x, y, width, height);
		
		// Title
		ctx.fillStyle = color;
		ctx.font = 'bold 28px Segoe UI, Roboto, Arial';
		ctx.textAlign = 'center';
		ctx.fillText(title, x + width / 2, y + 50);
		
		// Description
		ctx.fillStyle = 'rgba(255,255,255,0.9)';
		ctx.font = '16px Segoe UI, Roboto, Arial';
		const lines = description.split('\n');
		let offsetY = y + 90;
		for (const line of lines) {
			ctx.fillText(line, x + width / 2, offsetY);
			offsetY += 24;
		}
	}

	// Game loop
	let last = performance.now();
	function loop(now) {
		const dt = Math.min(0.05, (now - last) / 1000);
		last = now;

		// Show character selection screen
		if (characterSelectionActive) {
			render();
			drawCharacterSelection();
			requestAnimationFrame(loop);
			return;
		}

		// Skip game logic if paused for upgrades
		if (gamePaused) {
			render();
			drawUpgradeScreen();
			requestAnimationFrame(loop);
			return;
		}

		update(dt);
		render();
		requestAnimationFrame(loop);
	}

	function update(dt) {
		// advance game timer if player still alive
		if (player.health > 0) gameTime += dt;
		
		// Decrement invincibility frames
		player.invincibilityFrames = Math.max(0, player.invincibilityFrames - dt);
		
		// Decrement dash cooldown
		player.dashCooldown = Math.max(0, player.dashCooldown - dt);
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

		// Handle dash input
		if (keys.Space && !player.isDashing && player.dashCooldown <= 0 && player.health > 0) {
			// Start dash
			player.isDashing = true;
			player.dashTimer = player.dashDuration;
			player.dashCooldown = player.dashMaxCooldown;
			// Grant invincibility during dash
			player.invincibilityFrames = Math.max(player.invincibilityFrames, player.dashDuration);
			// Increment dash ID for damage tracking
			if (!player.currentDashId) player.currentDashId = 0;
			player.currentDashId++;
			
			// Use current movement direction or facing direction
			if (moving) {
				const len = Math.hypot(dx, dy) || 1;
				player.dashDirection.x = dx / len;
				player.dashDirection.y = dy / len;
			} else {
				// Use facing angle if not moving
				player.dashDirection.x = Math.cos(player.angle);
				player.dashDirection.y = Math.sin(player.angle);
			}
		}

		// Update dash state
		if (player.isDashing) {
			player.dashTimer -= dt;
			if (player.dashTimer <= 0) {
				player.isDashing = false;
				player.dashTimer = 0;
			}
			
			// Dash damage to enemies if upgraded
			if (playerUpgrades.dashDealsdamage) {
				for (let enemy of enemies) {
					if (enemy.health <= 0) continue;
					const dx = enemy.x - player.x;
					const dy = enemy.y - player.y;
					const dist = Math.hypot(dx, dy);
					// Check collision during dash
					if (dist < player.size + enemy.size) {
						// Only damage once per dash (use a dash ID)
						if (!enemy.lastHitDashId || enemy.lastHitDashId !== player.currentDashId) {
							enemy.health -= 10; // Same as sword damage
							if (enemy.health < 0) enemy.health = 0;
							enemy.lastHitDashId = player.currentDashId;
							// Knockback enemy
							const knockbackForce = 200;
							enemy.x += player.dashDirection.x * knockbackForce * dt;
							enemy.y += player.dashDirection.y * knockbackForce * dt;
						}
					}
				}
			}
		}

		// If player is knocked back, ignore movement input until knockback ends
		if (player.knockbackTimer <= 0) {
			if (player.isDashing) {
				// During dash, move at dash speed in dash direction
				player.x += player.dashDirection.x * player.dashSpeed * dt;
				player.y += player.dashDirection.y * player.dashSpeed * dt;
			} else if (moving && !player.caught) {
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
			
			// Handle boss behavior
			if (enemy.type === 'boss') {
				// Boss moves slowly toward player
				let moveX = 0;
				let moveY = 0;
				
				if (distToPlayer > 0.1) {
					moveX = toPlayerX / distToPlayer;
					moveY = toPlayerY / distToPlayer;
				}
				
				// Update position
				enemy.x += moveX * enemy.speed * dt;
				enemy.y += moveY * enemy.speed * dt;
				
				// Face player (but lock direction during telegraph and attack)
				if (!enemy.isTelegraphing && !enemy.isAttacking) {
					enemy.angle = Math.atan2(toPlayerY, toPlayerX);
				}
				enemy.pulse += dt * 6;
				
				// Attack logic
				if (enemy.isTelegraphing) {
					// Telegraph/windup phase - boss glows but doesn't swing yet
					enemy.telegraphTimer -= dt;
					if (enemy.telegraphTimer <= 0) {
						enemy.isTelegraphing = false;
						enemy.isAttacking = true;
						enemy.attackTimer = enemy.attackDuration;
						enemy.attackId++;
					}
				} else if (enemy.isAttacking) {
					enemy.attackTimer -= dt;
					if (enemy.attackTimer <= 0) {
						enemy.isAttacking = false;
						enemy.attackCooldown = enemy.attackMaxCooldown;
					}
				} else {
					// Update cooldown
					if (enemy.attackCooldown > 0) {
						enemy.attackCooldown -= dt;
					}
					
					// Start telegraph if close enough and cooldown is ready
					if (distToPlayer < 120 && enemy.attackCooldown <= 0) {
						enemy.isTelegraphing = true;
						enemy.telegraphTimer = enemy.telegraphDuration;
						enemy.attackAngle = Math.atan2(toPlayerY, toPlayerX);
						enemy.angle = enemy.attackAngle; // Lock facing to attack direction
					}
				}
				
				// Boss attack hits player
				if (enemy.isAttacking && player.invincibilityFrames <= 0) {
					const swingProgress = 1 - (enemy.attackTimer / enemy.attackDuration);
					const swingOffset = (swingProgress - 0.5) * Math.PI * 0.9;
					const effectiveAngle = enemy.attackAngle + swingOffset;
					
					// Check if player is in attack range
					const toPlayerAngle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
					let angleDiff = Math.abs(effectiveAngle - toPlayerAngle);
					const normalizedDiff = Math.min(angleDiff, Math.PI * 2 - angleDiff);
					
					const attackReach = enemy.size + enemy.swordReach;
					if (distToPlayer < attackReach && normalizedDiff < Math.PI * 0.4) {
						// Check if player is parrying and attack is within parry arc
						let parryBlocked = false;
						if (player.isParrying) {
							// Calculate angle from player to boss
							const toBossAngle = Math.atan2(enemy.y - player.y, enemy.x - player.x);
							const parryAngleDiff = normalizeAngle(toBossAngle - player.parryAngle);
							const parryArcAngle = Math.PI * 0.6; // Must match parry arc size
							if (Math.abs(parryAngleDiff) < parryArcAngle / 2) {
								parryBlocked = true;
							}
						}
						
						// Only damage player if not blocked by parry
						if (!parryBlocked) {
							// Hit player
							player.health -= 20; // Boss deals more damage
							if (player.health < 0) player.health = 0;
							player.invincibilityFrames = player.invincibilityDuration;
							
							// Strong knockback
							const knockbackForce = 400;
							player.vx = Math.cos(effectiveAngle) * knockbackForce;
							player.vy = Math.sin(effectiveAngle) * knockbackForce;
							player.knockbackTimer = player.knockbackDuration;
						}
					}
				}
				
				// Keep boss inside canvas
				const w = canvas.width / (window.devicePixelRatio || 1);
				const h = canvas.height / (window.devicePixelRatio || 1);
				enemy.x = clamp(enemy.x, enemy.size + 4, w - enemy.size - 4);
				enemy.y = clamp(enemy.y, enemy.size + 4, h - enemy.size - 4);
				continue;
			}
			
			// Handle shooter enemy behavior
			if (enemy.type === 'shooter') {
				// Shooter stays at optimal distance and shoots
				enemy.shootTimer += dt;
				
				let moveX = 0;
				let moveY = 0;
				let speedMultiplier = 1.0;
				
				if (distToPlayer > enemy.optimalDistance + 50) {
					// Move closer
					moveX = toPlayerX / distToPlayer;
					moveY = toPlayerY / distToPlayer;
				} else if (distToPlayer < enemy.optimalDistance - 50) {
					// Move away - slower when backing up
					moveX = -toPlayerX / distToPlayer;
					moveY = -toPlayerY / distToPlayer;
					speedMultiplier = 0.5; // Move at 50% speed when backing away
				} else {
					// Circle strafe
					const perpAngle = Math.atan2(toPlayerY, toPlayerX) + Math.PI / 2;
					moveX = Math.cos(perpAngle);
					moveY = Math.sin(perpAngle);
				}
				
				// Update position with speed multiplier
				enemy.x += moveX * enemy.speed * speedMultiplier * dt;
				enemy.y += moveY * enemy.speed * speedMultiplier * dt;
				
				// Always face player
				enemy.angle = Math.atan2(toPlayerY, toPlayerX);
				enemy.pulse += dt * 6;
				
				// Shoot at player
				if (enemy.shootTimer >= enemy.shootCooldown) {
					enemy.shootTimer = 0;
					const shootAngle = Math.atan2(toPlayerY, toPlayerX);
					projectiles.push(createProjectile(enemy.x, enemy.y, shootAngle));
				}
				
				// Keep enemy inside canvas
				const w = canvas.width / (window.devicePixelRatio || 1);
				const h = canvas.height / (window.devicePixelRatio || 1);
				enemy.x = clamp(enemy.x, enemy.size + 4, w - enemy.size - 4);
				enemy.y = clamp(enemy.y, enemy.size + 4, h - enemy.size - 4);
				continue;
			}
			
			// Melee enemy behavior - Always move toward player first
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
				const deadEnemy = enemies[i];
				
				// Check if boss was defeated
				if (deadEnemy.type === 'boss' && !inSafeRoom) {
					inSafeRoom = true;
					spawnEnabled = false;
					// Clear all enemies
					enemies.length = 0;
					// Position safe room objects
					const w = canvas.width / (window.devicePixelRatio || 1);
					const h = canvas.height / (window.devicePixelRatio || 1);
					healingStation.x = w / 2;
					healingStation.y = h / 2 - 120;
					healingStation.active = true;
					
					// Randomly select 3 items from the pool
					const poolKeys = Object.keys(permanentUpgradePool);
					const shuffled = poolKeys.sort(() => Math.random() - 0.5);
					for (let i = 0; i < 3 && i < shuffled.length; i++) {
						const itemKey = shuffled[i];
						const itemDef = permanentUpgradePool[itemKey];
						itemChoices[i].type = itemKey;
						itemChoices[i].name = itemDef.name;
						itemChoices[i].description = itemDef.description;
						itemChoices[i].color = itemDef.color;
					}
					
					// Position 3 items in a row
					itemChoices[0].x = w / 2 - 120;
					itemChoices[0].y = h / 2 + 20;
					itemChoices[1].x = w / 2;
					itemChoices[1].y = h / 2 + 20;
					itemChoices[2].x = w / 2 + 120;
					itemChoices[2].y = h / 2 + 20;
					// Position pressure plate at bottom
					pressurePlate.x = w / 2;
					pressurePlate.y = h - 100;
					pressurePlate.active = false;
					// Reset safe room state
					hasHealed = false;
					selectedItem = null;
					break;
				}
				
				// Chance to drop activatable (15% chance)
				if (Math.random() < 0.15) {
					const activatableTypeKeys = Object.keys(activatableTypes);
					const randomType = activatableTypeKeys[Math.floor(Math.random() * activatableTypeKeys.length)];
					activatables.push(createActivatable(deadEnemy.x, deadEnemy.y, randomType));
				}
				
				enemies.splice(i, 1);
				player.kills++;
				player.xp++;
				
				// Check for level up
				if (player.xp >= player.xpToNextLevel) {
					levelUp();
				}
			}
		}

		if (player.caught) {
			player.caughtTimer -= dt;
			if (player.caughtTimer <= 0) { player.caught = false; player.caughtTimer = 0; }
		}

		// Update projectiles
		for (let i = projectiles.length - 1; i >= 0; i--) {
			const proj = projectiles[i];

			// Move projectile
			proj.x += Math.cos(proj.angle) * proj.speed * dt;
			proj.y += Math.sin(proj.angle) * proj.speed * dt;
			proj.age += dt;

			// Remove if expired
			if (proj.age >= proj.lifetime) {
				projectiles.splice(i, 1);
				continue;
			}

			// Reflect with parry toward mouse (only if within parry arc)
			if (player.isParrying) {
				const toProjX = proj.x - player.x;
				const toProjY = proj.y - player.y;
				const projDist = Math.hypot(toProjX, toProjY);
				const parryRadius = player.size + 40;
				if (projDist < parryRadius) {
					// Check if projectile is within the parry arc
					const projAngle = Math.atan2(toProjY, toProjX);
					const angleDiff = normalizeAngle(projAngle - player.parryAngle);
					const arcAngle = Math.PI * 0.6; // Must match drawing arc
					if (Math.abs(angleDiff) < arcAngle / 2) {
						// Reflect toward mouse direction with pierce buff
						const toMouseX = mouse.x - player.x;
						const toMouseY = mouse.y - player.y;
						proj.angle = Math.atan2(toMouseY, toMouseX);
						proj.friendly = true;
						proj.pierce = true; // Parried projectiles can pierce through enemies
						proj.hitEnemies = []; // Track which enemies have been hit
						proj.damage *= 1.5; // Buff damage on parry
						proj.speed = Math.max(proj.speed, 400);
						proj.size = Math.max(proj.size, 8); // Make it slightly larger
					}
				}
			}

			// Check collision with player (only if hostile)
			if (!proj.friendly) {
				const distToPlayer = Math.hypot(proj.x - player.x, proj.y - player.y);
				if (distToPlayer < player.size + proj.size && player.invincibilityFrames <= 0) {
					// Hit player
					player.health -= proj.damage;
					if (player.health < 0) player.health = 0;
					player.invincibilityFrames = player.invincibilityDuration;

					// Knockback
					const knockbackDir = Math.atan2(proj.y - player.y, proj.x - player.x);
					const knockbackForce = 150;
					player.vx = Math.cos(knockbackDir) * knockbackForce;
					player.vy = Math.sin(knockbackDir) * knockbackForce;
					player.knockbackTimer = player.knockbackDuration;

					projectiles.splice(i, 1);
					continue;
				}
			}

			// Friendly projectiles can damage enemies
			if (proj.friendly) {
				let hitEnemy = false;
				let hitEnemyX = 0;
				let hitEnemyY = 0;
				for (const enemy of enemies) {
					if (enemy.health <= 0) continue;
					
					// Skip if this enemy was already hit by this piercing projectile
					if (proj.pierce && proj.hitEnemies && proj.hitEnemies.includes(enemy)) {
						continue;
					}
					
					const dx = proj.x - enemy.x;
					const dy = proj.y - enemy.y;
					const dist = Math.hypot(dx, dy);
					if (dist < enemy.size + proj.size) {
						enemy.health -= proj.damage;
						if (enemy.health < 0) enemy.health = 0;
						hitEnemy = true;
						hitEnemyX = enemy.x;
						hitEnemyY = enemy.y;
						
						// Track this enemy as hit for piercing projectiles
						if (proj.pierce) {
							if (!proj.hitEnemies) proj.hitEnemies = [];
							proj.hitEnemies.push(enemy);
						}
						
						// If projectile has pierce, don't break - continue hitting more enemies
						if (!proj.pierce) break;
					}
				}
				
				// Apply AOE damage if explosive shots upgrade is active
				if (hitEnemy && playerUpgrades.explosiveShotsStacks > 0) {
					const aoeRadius = 40 + (playerUpgrades.explosiveShotsStacks - 1) * 15; // Base 40, +15 per stack
					const aoeDamage = 5 + (playerUpgrades.explosiveShotsStacks - 1) * 3; // Base 5, +3 per stack
					
					// Create visual explosion effect
					shockwaves.push({
						x: hitEnemyX,
						y: hitEnemyY,
						radius: 0,
						maxRadius: aoeRadius,
						age: 0,
						lifetime: 0.3,
						color: '#ff6b35'
					});
					
					// Damage all enemies in AOE radius
					for (const enemy of enemies) {
						if (enemy.health <= 0) continue;
						const dx = hitEnemyX - enemy.x;
						const dy = hitEnemyY - enemy.y;
						const dist = Math.hypot(dx, dy);
						if (dist < aoeRadius) {
							enemy.health -= aoeDamage;
							if (enemy.health < 0) enemy.health = 0;
						}
					}
				}
				
				// Only remove projectile if it hit an enemy and doesn't have pierce
				if (hitEnemy && !proj.pierce) {
					projectiles.splice(i, 1);
					continue;
				}
			}

			// Remove if out of bounds
			const w = canvas.width / (window.devicePixelRatio || 1);
			const h = canvas.height / (window.devicePixelRatio || 1);
			if (proj.x < -50 || proj.x > w + 50 || proj.y < -50 || proj.y > h + 50) {
				projectiles.splice(i, 1);
			}
		}

		// Attack logic
		if (player.isAttacking) {
			player.attackTimer -= dt;
			if (player.attackTimer <= 0) {
				player.isAttacking = false;
			}
		}
		
		// Parry logic
		if (player.isParrying) {
			// Update parry angle to always point toward mouse
			const dx = mouse.x - player.x;
			const dy = mouse.y - player.y;
			player.parryAngle = Math.atan2(dy, dx);
			
			player.parryTimer -= dt;
			if (player.parryTimer <= 0) {
				player.isParrying = false;
				// Apply cooldown (halved if buff active)
				const cooldownMultiplier = activeBuffs.find(b => b.type === 'halfCooldown') ? 0.5 : 1.0;
				player.parryCooldown = player.parryMaxCooldown * cooldownMultiplier;
			}
		}
		
		// Parry cooldown
		if (player.parryCooldown > 0) {
			player.parryCooldown -= dt;
		}

		// Projectile shooting cooldown
		if (player.shootCooldown > 0) {
			player.shootCooldown -= dt;
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

		const swordMinReach = 0; // Allow hitting enemies even when very close
		const swordMaxReach = player.size + player.swordReach + 10;

		// Only knockback and damage if actively attacking
		if (player.isAttacking && edist >= swordMinReach && edist < swordMaxReach && normalizedDiff < Math.PI * 0.4) {
			// Knockback enemy along the effective swing direction
			// Scouts get stronger knockback due to their speed
			const knockbackForce = enemy.type === 'scout' ? 300 : 150;
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
	}

	// Restore player position in case any logic accidentally modified it.
	player.x = _savedPlayerX;
	player.y = _savedPlayerY;

	// Keep inside canvas boundaries
	const w = canvas.width / (window.devicePixelRatio || 1);
	const h = canvas.height / (window.devicePixelRatio || 1);
	player.x = clamp(player.x, player.size + 4, w - player.size - 4);
	player.y = clamp(player.y, player.size + 4, h - player.size - 4);

		// Boss spawn at 60 seconds
		if (!bossSpawned && gameTime >= bossSpawnTime) {
			bossSpawned = true;
			
			// Clear all existing enemies
			enemies.length = 0;
			
			// Spawn boss at center of screen
			const bossX = w / 2;
			const bossY = h / 2;
			enemies.push(createEnemy(bossX, bossY, 'boss'));
			
			// Create shockwave effect
			shockwaves.push(createShockwave(bossX, bossY));
			
			// Spawn 4 melee enemies around the boss
			const distance = 100; // Distance from boss
			// Top
			enemies.push(createEnemy(bossX, bossY - distance, 'melee'));
			// Right
			enemies.push(createEnemy(bossX + distance, bossY, 'melee'));
			// Bottom
			enemies.push(createEnemy(bossX, bossY + distance, 'melee'));
			// Left
			enemies.push(createEnemy(bossX - distance, bossY, 'melee'));
		}
		
		// Controlled enemy spawning: spawn at fixed interval up to maxEnemies
		if (spawnEnabled) {
			// Check if boss is alive
			const bossAlive = enemies.some(e => e.type === 'boss' && e.health > 0);
			const currentSpawnInterval = bossAlive ? 2.5 : spawnInterval;
			
			spawnTimer += dt;
			let activeCount = enemies.reduce((s, e) => s + (e.health > 0 ? 1 : 0), 0);
			// safety cap for total array size to avoid runaway memory growth
			const maxTotalEnemies = Math.max(100, maxEnemies * 4);
			// spawn while there's accumulated time (handles lag) but limit spawns per frame
			let spawnsThisFrame = 0;
			while (spawnTimer >= currentSpawnInterval && spawnsThisFrame < 3) {
				spawnTimer -= currentSpawnInterval;
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
			// Spawn mix: 20% scout (fast/frail), 25% shooter, otherwise melee
			const r = Math.random();
			let enemyType = 'melee';
			if (r < 0.2) enemyType = 'scout';
			else if (r < 0.45) enemyType = 'shooter';
				enemies.push(createEnemy(sx, sy, enemyType));
				activeCount++;
			}
		}
		
		// Update activatables (age and pickup)
		for (let i = activatables.length - 1; i >= 0; i--) {
			const item = activatables[i];
			item.age += dt;
			item.pulse += dt * 8;
			
			// Remove if expired
			if (item.age >= item.lifetime) {
				activatables.splice(i, 1);
				continue;
			}
			
			// Check for pickup
			const dx = item.x - player.x;
			const dy = item.y - player.y;
			const dist = Math.hypot(dx, dy);
			if (dist < player.size + item.size + 10 && player.health > 0) {
				// Store the item (replaces existing if any)
				storedActivatable = item.type;
				activatables.splice(i, 1);
			}
		}
		
		// Update active buffs
		for (let i = activeBuffs.length - 1; i >= 0; i--) {
			const buff = activeBuffs[i];
			buff.timer -= dt;
			if (buff.timer <= 0) {
				activeBuffs.splice(i, 1);
			}
		}
		
		// Update shockwaves
		for (let i = shockwaves.length - 1; i >= 0; i--) {
			const shockwave = shockwaves[i];
			shockwave.age += dt;
			shockwave.radius = (shockwave.age / shockwave.lifetime) * shockwave.maxRadius;
			if (shockwave.age >= shockwave.lifetime) {
				shockwaves.splice(i, 1);
			}
		}
		
		// Safe room interactions
		if (inSafeRoom && player.health > 0) {
			// Healing station interaction
			if (healingStation.active && !hasHealed) {
				const distToHealing = Math.hypot(player.x - healingStation.x, player.y - healingStation.y);
				if (distToHealing < player.size + healingStation.size) {
					player.health = player.maxHealth;
					hasHealed = true;
					healingStation.active = false;
				}
			}
			
			// Item selection
			if (!selectedItem) {
				for (let item of itemChoices) {
					const distToItem = Math.hypot(player.x - item.x, player.y - item.y);
					if (distToItem < player.size + item.size) {
						selectedItem = item.type;
						// Apply item effect
						const itemDef = permanentUpgradePool[item.type];
						if (itemDef && itemDef.apply) {
							itemDef.apply();
							console.log('Applied upgrade:', item.name);
						}
						break;
					}
				}
			}
			
			// Enable pressure plate once both healing and item selection are done
			if (hasHealed && selectedItem) {
				pressurePlate.active = true;
			}
			
			// Pressure plate interaction
			if (pressurePlate.active) {
				const distToPlate = Math.hypot(player.x - pressurePlate.x, player.y - pressurePlate.y);
				if (distToPlate < player.size + pressurePlate.size) {
					// Advance to next level (placeholder)
					console.log('Advancing to next level...');
					// Reset for next level
					inSafeRoom = false;
					spawnEnabled = true;
					bossSpawned = false;
					gameTime = 0;
				}
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
		
		// Draw safe room elements
		if (inSafeRoom) {
			// Draw healing station
			if (!hasHealed) {
				ctx.save();
				ctx.translate(healingStation.x, healingStation.y);
				
				// Pulsing green cross
				const healPulse = Math.sin(gameTime * 4) * 0.2 + 1;
				ctx.shadowBlur = 20;
				ctx.shadowColor = '#4ade80';
				ctx.fillStyle = '#4ade80';
				
				// Horizontal bar
				ctx.fillRect(-healingStation.size * 0.8 * healPulse, -healingStation.size * 0.25, healingStation.size * 1.6 * healPulse, healingStation.size * 0.5);
				// Vertical bar
				ctx.fillRect(-healingStation.size * 0.25, -healingStation.size * 0.8 * healPulse, healingStation.size * 0.5, healingStation.size * 1.6 * healPulse);
				
				ctx.shadowBlur = 0;
				// Label
				ctx.fillStyle = '#ffffff';
				ctx.font = 'bold 14px Segoe UI, Roboto, Arial';
				ctx.textAlign = 'center';
				ctx.fillText('HEAL', 0, healingStation.size + 25);
				ctx.restore();
			}
			
			// Draw item choices
			if (!selectedItem) {
				for (let item of itemChoices) {
					ctx.save();
					ctx.translate(item.x, item.y);
					
					const itemPulse = Math.sin(gameTime * 3) * 0.1 + 1;
					ctx.shadowBlur = 25;
					ctx.shadowColor = item.color;
					
					// Draw hexagon
					ctx.fillStyle = item.color;
					ctx.beginPath();
					for (let i = 0; i < 6; i++) {
						const angle = (i / 6) * Math.PI * 2 - Math.PI / 2;
						const x = Math.cos(angle) * item.size * itemPulse;
						const y = Math.sin(angle) * item.size * itemPulse;
						if (i === 0) ctx.moveTo(x, y);
						else ctx.lineTo(x, y);
					}
					ctx.closePath();
					ctx.fill();
					ctx.strokeStyle = '#ffffff';
					ctx.lineWidth = 3;
					ctx.stroke();
					
					ctx.shadowBlur = 0;
					// Label
					ctx.fillStyle = '#ffffff';
					ctx.font = 'bold 16px Segoe UI, Roboto, Arial';
					ctx.textAlign = 'center';
					ctx.fillText(item.name, 0, item.size + 30);
					ctx.font = '12px Segoe UI, Roboto, Arial';
					ctx.fillText(item.description, 0, item.size + 48);
					ctx.restore();
				}
			}
			
			// Draw pressure plate
			ctx.save();
			ctx.translate(pressurePlate.x, pressurePlate.y);
			
			if (pressurePlate.active) {
				const platePulse = Math.sin(gameTime * 5) * 0.15 + 1;
				ctx.shadowBlur = 20;
				ctx.shadowColor = '#00d4ff';
				ctx.fillStyle = '#00d4ff';
			} else {
				ctx.fillStyle = '#555555';
			}
			
			// Square plate
			ctx.fillRect(-pressurePlate.size / 2, -pressurePlate.size / 2, pressurePlate.size, pressurePlate.size);
			ctx.strokeStyle = '#ffffff';
			ctx.lineWidth = 3;
			ctx.strokeRect(-pressurePlate.size / 2, -pressurePlate.size / 2, pressurePlate.size, pressurePlate.size);
			
			ctx.shadowBlur = 0;
			// Label
			ctx.fillStyle = '#ffffff';
			ctx.font = 'bold 14px Segoe UI, Roboto, Arial';
			ctx.textAlign = 'center';
			if (pressurePlate.active) {
				ctx.fillText('CONTINUE', 0, pressurePlate.size + 25);
			} else {
				ctx.fillStyle = '#888888';
				ctx.fillText('Complete objectives first', 0, pressurePlate.size + 25);
			}
			ctx.restore();
		}
		
		// Draw shockwaves
		for (let shockwave of shockwaves) {
			ctx.save();
			const progress = shockwave.age / shockwave.lifetime;
			const alpha = (1 - progress) * 0.6;
			
			// Use custom color if specified, otherwise default red
			const baseColor = shockwave.color || '255, 0, 0';
			const isCustomColor = shockwave.color;
			
			// Parse color if it's in hex format
			let r = 255, g = 0, b = 0;
			if (isCustomColor && shockwave.color.startsWith('#')) {
				const hex = shockwave.color.substring(1);
				r = parseInt(hex.substring(0, 2), 16);
				g = parseInt(hex.substring(2, 4), 16);
				b = parseInt(hex.substring(4, 6), 16);
			}
			
			// Draw expanding circle
			ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
			ctx.lineWidth = 8 * (1 - progress * 0.5);
			ctx.beginPath();
			ctx.arc(shockwave.x, shockwave.y, shockwave.radius, 0, Math.PI * 2);
			ctx.stroke();
			
			// Inner glow
			if (!isCustomColor) {
				ctx.strokeStyle = `rgba(255, 255, 0, ${alpha * 0.5})`;
			} else {
				ctx.strokeStyle = `rgba(${Math.min(r + 50, 255)}, ${Math.min(g + 50, 255)}, ${Math.min(b + 50, 255)}, ${alpha * 0.5})`;
			}
			ctx.lineWidth = 4 * (1 - progress * 0.5);
			ctx.beginPath();
			ctx.arc(shockwave.x, shockwave.y, shockwave.radius * 0.95, 0, Math.PI * 2);
			ctx.stroke();
			
			ctx.restore();
		}
		
		// Draw activatables (pickups)
		for (let item of activatables) {
			const buffDef = activatableTypes[item.type];
			ctx.save();
			ctx.translate(item.x, item.y);
			
			// Pulse effect
			const pulse = 1 + Math.sin(item.pulse) * 0.15;
			const bobY = Math.sin(item.pulse * 0.7) * 3;
			ctx.translate(0, bobY);
			
			// Outer glow
			ctx.shadowBlur = 20;
			ctx.shadowColor = buffDef.color;
			
			// Draw item as glowing crystal/cube
			ctx.fillStyle = buffDef.color;
			ctx.strokeStyle = '#ffffff';
			ctx.lineWidth = 2;
			
			// Draw diamond shape
			ctx.beginPath();
			const size = item.size * pulse;
			ctx.moveTo(0, -size * 1.5);
			ctx.lineTo(size, 0);
			ctx.lineTo(0, size * 1.5);
			ctx.lineTo(-size, 0);
			ctx.closePath();
			ctx.fill();
			ctx.stroke();
			
			ctx.shadowBlur = 0;
			ctx.restore();
		}

		// draw all enemies (behind player) - only if alive
		for (let enemy of enemies) {
			if (enemy.health > 0) {
				ctx.save();
				ctx.translate(enemy.x, enemy.y);
				ctx.rotate(enemy.angle);
				// pulse when near
				const pulse = 1 + Math.sin(enemy.pulse) * 0.04;
				
				// Draw boss enemy
				if (enemy.type === 'boss') {
					// Telegraph warning - pulsing red indicator
					if (enemy.isTelegraphing) {
						const telegraphProgress = 1 - (enemy.telegraphTimer / enemy.telegraphDuration);
						const glowIntensity = Math.sin(telegraphProgress * Math.PI * 8) * 0.5 + 0.5;
						ctx.shadowBlur = 50 + glowIntensity * 30;
						ctx.shadowColor = '#ff0000';
						
						// Draw warning arc in attack direction
						ctx.save();
						ctx.rotate(enemy.attackAngle - enemy.angle);
						ctx.strokeStyle = `rgba(255, 255, 0, ${0.4 + glowIntensity * 0.4})`;
						ctx.fillStyle = `rgba(255, 0, 0, ${0.1 + glowIntensity * 0.2})`;
						ctx.lineWidth = 4;
						const attackReach = enemy.size + enemy.swordReach + 20;
						ctx.beginPath();
						ctx.arc(0, 0, attackReach, -Math.PI * 0.4, Math.PI * 0.4);
						ctx.lineTo(0, 0);
						ctx.closePath();
						ctx.fill();
						ctx.stroke();
						ctx.restore();
					}
					
					// Large red enemy with glowing aura
					if (enemyImage.complete) {
						const size = enemy.size * 2.2 * pulse;
						// Draw glow effect (enhanced during telegraph)
						ctx.shadowBlur = enemy.isTelegraphing ? 60 : 30;
						ctx.shadowColor = enemy.color;
						ctx.drawImage(enemyImage, -size / 2, -size / 2, size, size);
						ctx.shadowBlur = 0;
					} else {
						// Fallback: large red circle with glow
						ctx.shadowBlur = enemy.isTelegraphing ? 60 : 30;
						ctx.shadowColor = enemy.color;
						ctx.beginPath();
						ctx.fillStyle = enemy.color;
						ctx.arc(0, 0, enemy.size * pulse, 0, Math.PI * 2);
						ctx.fill();
						ctx.strokeStyle = '#ffffff';
						ctx.lineWidth = 3;
						ctx.stroke();
						ctx.shadowBlur = 0;
						// Eyes
						ctx.fillStyle = '#ffff00';
						ctx.beginPath();
						ctx.arc(enemy.size - 12, -8, 5, 0, Math.PI * 2);
						ctx.fill();
						ctx.beginPath();
						ctx.arc(enemy.size - 12, 8, 5, 0, Math.PI * 2);
						ctx.fill();
					}
					
					// Draw boss health bar
					ctx.rotate(-enemy.angle); // Reset rotation for health bar
					const healthBarWidth = 80;
					const healthBarHeight = 8;
					const healthBarY = -enemy.size - 20;
					ctx.fillStyle = 'rgba(0,0,0,0.7)';
					ctx.fillRect(-healthBarWidth / 2, healthBarY, healthBarWidth, healthBarHeight);
					const healthPercent = enemy.health / enemy.maxHealth;
					ctx.fillStyle = '#ff0000';
					ctx.fillRect(-healthBarWidth / 2 + 1, healthBarY + 1, (healthBarWidth - 2) * healthPercent, healthBarHeight - 2);
					ctx.strokeStyle = '#ffffff';
					ctx.lineWidth = 1;
					ctx.strokeRect(-healthBarWidth / 2, healthBarY, healthBarWidth, healthBarHeight);
					// Boss label
					ctx.fillStyle = '#ffffff';
					ctx.font = 'bold 12px Segoe UI, Roboto, Arial';
					ctx.textAlign = 'center';
					ctx.fillText('BOSS', 0, healthBarY - 6);
					ctx.textAlign = 'left';
					
					// Draw boss sword if attacking
					if (enemy.isAttacking) {
						const swingProgress = 1 - (enemy.attackTimer / enemy.attackDuration);
						const swingAngle = (swingProgress - 0.5) * Math.PI * 0.9;
						ctx.rotate(enemy.angle); // Restore rotation
						ctx.save();
						ctx.rotate(swingAngle);
						ctx.strokeStyle = '#ffff00';
						ctx.lineWidth = enemy.swordWidth;
						ctx.lineCap = 'round';
						ctx.shadowBlur = 15;
						ctx.shadowColor = '#ffff00';
						ctx.beginPath();
						ctx.moveTo(enemy.size * 0.7, 0);
						ctx.lineTo(enemy.size + enemy.swordReach, 0);
						ctx.stroke();
						ctx.shadowBlur = 0;
						ctx.restore();
					}
				} else if (enemy.type === 'shooter') {
					// Purple hexagon for shooter
					ctx.beginPath();
					ctx.fillStyle = enemy.color;
					for (let i = 0; i < 6; i++) {
						const angle = (i / 6) * Math.PI * 2;
						const x = Math.cos(angle) * enemy.size * pulse;
						const y = Math.sin(angle) * enemy.size * pulse;
						if (i === 0) ctx.moveTo(x, y);
						else ctx.lineTo(x, y);
					}
					ctx.closePath();
					ctx.fill();
					ctx.strokeStyle = '#ffffff';
					ctx.lineWidth = 2;
					ctx.stroke();
					// Gun barrel
					ctx.strokeStyle = '#ffffff';
					ctx.lineWidth = 3;
					ctx.beginPath();
					ctx.moveTo(enemy.size * 0.3, 0);
					ctx.lineTo(enemy.size * 1.2, 0);
					ctx.stroke();
				} else {
					// Draw melee enemy (original)
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
				}
				ctx.restore();
			}
		}

		// Draw projectiles
		for (let proj of projectiles) {
			ctx.save();
			ctx.translate(proj.x, proj.y);
			ctx.rotate(proj.angle);
			
			// Draw projectile as glowing orb with trail
			const projColor = proj.color || '#ff00ff';
			ctx.fillStyle = projColor;
			// Pierce projectiles have enhanced glow
			ctx.shadowBlur = proj.pierce ? 20 : 10;
			ctx.shadowColor = projColor;
			ctx.beginPath();
			ctx.arc(0, 0, proj.size, 0, Math.PI * 2);
			ctx.fill();
			
			// Pierce projectiles have extra outer glow ring
			if (proj.pierce) {
				ctx.shadowBlur = 15;
				ctx.strokeStyle = projColor;
				ctx.lineWidth = 2;
				ctx.beginPath();
				ctx.arc(0, 0, proj.size * 1.3, 0, Math.PI * 2);
				ctx.stroke();
			}
			
			// Trail
			ctx.shadowBlur = 0;
			if (proj.color) {
				// Player projectile - use character color with transparency
				const hexToRgb = (hex) => {
					const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
					return result ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : '255, 255, 255';
				};
				// Pierce projectiles have more visible trail
				const trailAlpha = proj.pierce ? 0.5 : 0.3;
				ctx.fillStyle = `rgba(${hexToRgb(proj.color)}, ${trailAlpha})`;
			} else {
				// Enemy projectile
				ctx.fillStyle = 'rgba(255, 0, 255, 0.3)';
			}
			ctx.beginPath();
			ctx.ellipse(-proj.size * 1.5, 0, proj.size * 2, proj.size * 0.5, 0, 0, Math.PI * 2);
			ctx.fill();
			
			ctx.restore();
		}

		// draw player (Chingling) with rotation and effects
		ctx.save();
		
		// Dash trail effect
		if (player.isDashing) {
			const dashProgress = 1 - (player.dashTimer / player.dashDuration);
			// Draw motion blur trail
			for (let i = 0; i < 5; i++) {
				const trailOffset = (i + 1) * 8;
				const trailX = player.x - player.dashDirection.x * trailOffset;
				const trailY = player.y - player.dashDirection.y * trailOffset;
				const alpha = (1 - dashProgress) * (1 - i / 5) * 0.4;
				
				ctx.save();
				ctx.globalAlpha = alpha;
				ctx.translate(trailX, trailY);
				ctx.rotate(player.angle);
				drawChingling();
				ctx.restore();
			}
		}
		
		// Flash effect during invincibility frames
		if (player.invincibilityFrames > 0) {
			// Blink every 0.15 seconds
			const blinkPhase = (player.invincibilityFrames / 0.15) % 2;
			if (blinkPhase < 1) {
				// Invisible half the time
				ctx.globalAlpha = 0.3;
			}
		}
		
		// Dash glow effect
		if (player.isDashing) {
			ctx.shadowColor = '#00d4ff';
			ctx.shadowBlur = 20;
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
		
		// Draw parry shield if parrying (arc in parry direction)
		if (player.isParrying) {
			const parryRadius = player.size + 40;
			const parryProgress = player.parryTimer / player.parryDuration;
			const arcAngle = Math.PI * 0.6; // 108 degree arc
			ctx.save();
			// Rotate relative to world coordinates (undo player rotation, then apply parry angle)
			ctx.rotate(player.parryAngle - displayAngle);
			ctx.strokeStyle = '#4ade80';
			ctx.fillStyle = `rgba(74, 222, 128, ${0.2 * parryProgress})`;
			ctx.lineWidth = 3;
			ctx.beginPath();
			ctx.arc(0, 0, parryRadius, -arcAngle / 2, arcAngle / 2);
			ctx.lineTo(0, 0);
			ctx.closePath();
			ctx.fill();
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
		ctx.fillText(`Level ${player.level} | Kills: ${player.kills} | XP: ${player.xp}/${player.xpToNextLevel}`, 12, 20);
		
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
		ctx.fillText(`HP: ${Math.max(0, Math.round(player.health))}/${player.maxHealth}`, healthBarX + 5, healthBarY + 12);
		
		// Ability cooldown bar (character-specific)
		if (characterSelected) {
			const char = characterTypes[characterSelected];
			const abilityBarWidth = 150;
			const abilityBarHeight = 12;
			const abilityBarX = 12;
			const abilityBarY = 54;
			ctx.fillStyle = 'rgba(0,0,0,0.5)';
			ctx.fillRect(abilityBarX, abilityBarY, abilityBarWidth, abilityBarHeight);
			
			let cooldownPercent, abilityText;
			if (char.hasParry) {
				cooldownPercent = 1 - (player.parryCooldown / player.parryMaxCooldown);
				abilityText = cooldownPercent >= 1 ? 'PARRY READY' : `Parry: ${(player.parryCooldown).toFixed(1)}s`;
			} else if (char.hasProjectile) {
				cooldownPercent = 1 - (player.shootCooldown / player.shootMaxCooldown);
				abilityText = cooldownPercent >= 1 ? 'SHOOT READY' : `Shoot: ${(player.shootCooldown).toFixed(1)}s`;
			}
			
			const abilityColor = cooldownPercent >= 1 ? '#4ade80' : '#facc15';
			ctx.fillStyle = abilityColor;
			ctx.fillRect(abilityBarX + 2, abilityBarY + 2, (abilityBarWidth - 4) * cooldownPercent, abilityBarHeight - 4);
			ctx.strokeStyle = 'rgba(255,255,255,0.6)';
			ctx.lineWidth = 1;
			ctx.strokeRect(abilityBarX, abilityBarY, abilityBarWidth, abilityBarHeight);
			ctx.fillStyle = 'rgba(255,255,255,0.9)';
			ctx.font = 'bold 10px Segoe UI, Roboto, Arial';
			ctx.fillText(abilityText, abilityBarX + 5, abilityBarY + 9);
		}
		
		// Dash cooldown bar
		const dashBarWidth = 150;
		const dashBarHeight = 12;
		const dashBarX = 12;
		const dashBarY = 70;
		ctx.fillStyle = 'rgba(0,0,0,0.5)';
		ctx.fillRect(dashBarX, dashBarY, dashBarWidth, dashBarHeight);
		
		const dashCooldownPercent = 1 - (player.dashCooldown / player.dashMaxCooldown);
		const dashText = dashCooldownPercent >= 1 ? 'DASH READY' : `Dash: ${(player.dashCooldown).toFixed(1)}s`;
		const dashColor = dashCooldownPercent >= 1 ? '#00d4ff' : '#888888';
		ctx.fillStyle = dashColor;
		ctx.fillRect(dashBarX + 2, dashBarY + 2, (dashBarWidth - 4) * dashCooldownPercent, dashBarHeight - 4);
		ctx.strokeStyle = 'rgba(255,255,255,0.6)';
		ctx.lineWidth = 1;
		ctx.strokeRect(dashBarX, dashBarY, dashBarWidth, dashBarHeight);
		ctx.fillStyle = 'rgba(255,255,255,0.9)';
		ctx.font = 'bold 10px Segoe UI, Roboto, Arial';
		ctx.fillText(dashText, dashBarX + 5, dashBarY + 9);
		
		if (player.caught) {
			ctx.fillStyle = 'rgba(255,90,90,0.95)';
			ctx.font = '16px Segoe UI, Roboto, Arial';
			ctx.fillText('PEGO!', 12, 62);
		}
		
		// Stored activatable display (inventory slot)
		if (storedActivatable) {
			const itemDef = activatableTypes[storedActivatable];
			const boxSize = 60;
			const boxX = w - boxSize - 12;
			const boxY = 12;
			
			// Box background
			ctx.fillStyle = 'rgba(0,0,0,0.7)';
			ctx.fillRect(boxX, boxY, boxSize, boxSize);
			
			// Box border (glowing with item color)
			ctx.strokeStyle = itemDef.color;
			ctx.lineWidth = 3;
			ctx.shadowBlur = 10;
			ctx.shadowColor = itemDef.color;
			ctx.strokeRect(boxX, boxY, boxSize, boxSize);
			ctx.shadowBlur = 0;
			
			// Draw item icon (diamond shape)
			ctx.save();
			ctx.translate(boxX + boxSize / 2, boxY + boxSize / 2);
			ctx.fillStyle = itemDef.color;
			ctx.strokeStyle = '#ffffff';
			ctx.lineWidth = 2;
			const iconSize = 12;
			ctx.beginPath();
			ctx.moveTo(0, -iconSize);
			ctx.lineTo(iconSize * 0.8, 0);
			ctx.lineTo(0, iconSize);
			ctx.lineTo(-iconSize * 0.8, 0);
			ctx.closePath();
			ctx.fill();
			ctx.stroke();
			ctx.restore();
			
			// "Press F" text below box
			ctx.fillStyle = 'rgba(255,255,255,0.9)';
			ctx.font = 'bold 11px Segoe UI, Roboto, Arial';
			ctx.textAlign = 'center';
			ctx.fillText('Press F', boxX + boxSize / 2, boxY + boxSize + 14);
			
			// Item name below
			ctx.font = '10px Segoe UI, Roboto, Arial';
			ctx.fillStyle = itemDef.color;
			ctx.fillText(itemDef.name, boxX + boxSize / 2, boxY + boxSize + 28);
			ctx.textAlign = 'left';
		}
		
		// Active buffs display
		if (activeBuffs.length > 0) {
			const buffStartY = h - 60;
			const buffX = 12;
			let offsetY = 0;
			
			ctx.font = 'bold 11px Segoe UI, Roboto, Arial';
			ctx.fillStyle = 'rgba(255,255,255,0.9)';
			ctx.fillText('ACTIVE BUFFS:', buffX, buffStartY);
			
			for (let i = 0; i < activeBuffs.length; i++) {
				const buff = activeBuffs[i];
				const buffDef = activatableTypes[buff.type];
				offsetY = (i + 1) * 18;
				
				// Buff bar background
				const barWidth = 180;
				const barHeight = 14;
				const barY = buffStartY + offsetY;
				
				ctx.fillStyle = 'rgba(0,0,0,0.6)';
				ctx.fillRect(buffX, barY, barWidth, barHeight);
				
				// Timer bar
				const timerPercent = buff.timer / buffDef.duration;
				ctx.fillStyle = buffDef.color;
				ctx.fillRect(buffX + 2, barY + 2, (barWidth - 4) * timerPercent, barHeight - 4);
				
				// Border
				ctx.strokeStyle = buffDef.color;
				ctx.lineWidth = 1;
				ctx.strokeRect(buffX, barY, barWidth, barHeight);
				
				// Text
				ctx.fillStyle = 'rgba(255,255,255,0.95)';
				ctx.font = 'bold 10px Segoe UI, Roboto, Arial';
				ctx.fillText(`${buffDef.name}: ${Math.ceil(buff.timer)}s`, buffX + 5, barY + 10);
			}
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

