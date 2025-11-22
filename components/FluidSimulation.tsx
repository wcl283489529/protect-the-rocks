import React, { useEffect, useRef } from 'react';
import { SimplexNoise } from '../utils/simplex';
import { GoogleGenAI } from "@google/genai";

// --- SOUND SYSTEM ---
class SoundSystem {
  ctx: AudioContext | null = null;
  masterGain: GainNode | null = null;
  sfxGain: GainNode | null = null;
  
  // Effects
  reverbNode: ConvolverNode | null = null;
  delayNode: DelayNode | null = null;
  delayFeedback: GainNode | null = null;

  // Active Sources
  chargeOsc: OscillatorNode | null = null;
  chargeGain: GainNode | null = null;
  chargeLFO: OscillatorNode | null = null; // For trembling effect
  
  constructor() {
    // Lazy init handled in resume
  }

  init() {
    if (this.ctx) return;
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    this.ctx = new AudioContextClass();
    
    // Master Chain
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.5; // Slightly louder master
    
    // Dynamics Compressor to glue sounds together and prevent clipping
    const compressor = this.ctx.createDynamicsCompressor();
    compressor.threshold.value = -12;
    compressor.ratio.value = 8;
    
    this.masterGain.connect(compressor);
    compressor.connect(this.ctx.destination);

    // SFX Bus
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.8;
    this.sfxGain.connect(this.masterGain);

    // Ethereal FX Chain (Reverb + Delay) - Kept for Win SFX
    this.setupEffects();
  }

  setupEffects() {
    if (!this.ctx || !this.masterGain) return;

    // 1. Reverb (Convolver)
    this.reverbNode = this.ctx.createConvolver();
    // Create a noise buffer for the reverb impulse response (3 seconds tail)
    const duration = 3.0; 
    const decay = 3.0;
    const rate = this.ctx.sampleRate;
    const length = rate * duration;
    const impulse = this.ctx.createBuffer(2, length, rate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);
    
    for (let i = 0; i < length; i++) {
        // Exponential decay noise
        const n = i / length;
        const vol = (Math.random() * 2 - 1) * Math.pow(1 - n, decay);
        left[i] = vol;
        right[i] = vol;
    }
    this.reverbNode.buffer = impulse;
    this.reverbNode.connect(this.masterGain);

    // 2. Delay (Echo)
    this.delayNode = this.ctx.createDelay();
    this.delayNode.delayTime.value = 0.5; // 500ms echo
    this.delayFeedback = this.ctx.createGain();
    this.delayFeedback.gain.value = 0.5; // 50% feedback

    this.delayNode.connect(this.delayFeedback);
    this.delayFeedback.connect(this.delayNode);
    this.delayNode.connect(this.reverbNode); // Delay feeds into reverb
  }

  async resume() {
    if (!this.ctx) this.init();
    if (this.ctx && this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  startCharge() {
    if (!this.ctx || !this.sfxGain || this.chargeOsc) return;
    
    // Sci-fi Charge: Rising pitch + accelerating tremolo
    this.chargeOsc = this.ctx.createOscillator();
    this.chargeLFO = this.ctx.createOscillator();
    this.chargeGain = this.ctx.createGain();
    const lfoGain = this.ctx.createGain(); 

    this.chargeOsc.type = 'triangle'; // Triangle cuts through mix better
    this.chargeOsc.frequency.value = 200; 

    this.chargeLFO.type = 'square';
    this.chargeLFO.frequency.value = 10; 

    this.chargeLFO.connect(lfoGain);
    lfoGain.connect(this.chargeGain.gain);
    
    // Initial State
    lfoGain.gain.value = 0.3; 
    this.chargeGain.gain.value = 0.0; // Start silent
    
    // Smooth fade in
    this.chargeGain.gain.linearRampToValueAtTime(0.15, this.ctx.currentTime + 0.1);

    this.chargeOsc.connect(this.chargeGain);
    this.chargeGain.connect(this.sfxGain);
    
    this.chargeOsc.start();
    this.chargeLFO.start();
  }

  updateCharge(level: number, max: number) {
    if (!this.ctx || !this.chargeOsc || !this.chargeLFO) return;
    const ratio = level / max;
    const t = this.ctx.currentTime;

    // Pitch rises: 200Hz -> 800Hz
    this.chargeOsc.frequency.setTargetAtTime(200 + ratio * 600, t, 0.1);
    
    // Tremolo speed increases: 10Hz -> 50Hz (buzz)
    this.chargeLFO.frequency.setTargetAtTime(10 + ratio * 40, t, 0.1);
  }

  stopCharge() {
    if (!this.ctx || !this.chargeOsc || !this.chargeGain || !this.chargeLFO) return;
    const now = this.ctx.currentTime;
    this.chargeGain.gain.cancelScheduledValues(now);
    this.chargeGain.gain.setTargetAtTime(0, now, 0.1);
    
    this.chargeOsc.stop(now + 0.2);
    this.chargeLFO.stop(now + 0.2);
    
    this.chargeOsc = null;
    this.chargeLFO = null;
    this.chargeGain = null;
  }

  playShoot(powerRatio: number) {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    // "Pew" - Fast frequency sweep
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(800 + powerRatio * 600, t);
    osc.frequency.exponentialRampToValueAtTime(100, t + 0.2); 
    
    gain.gain.setValueAtTime(0.4 + powerRatio * 0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    
    osc.connect(gain);
    gain.connect(this.sfxGain);
    
    // Add some "Plasma" noise
    if (powerRatio > 0.3) {
        const noise = this.createNoiseBurst(0.15);
        const noiseGain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 3000;

        noiseGain.gain.value = 0.2;
        noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
        
        noise.connect(filter);
        filter.connect(noiseGain);
        noiseGain.connect(this.sfxGain);
        noise.start(t);
    }

    osc.start(t);
    osc.stop(t + 0.2);
  }

  createNoiseBurst(duration: number): AudioBufferSourceNode {
      const bufferSize = this.ctx!.sampleRate * duration;
      const buffer = this.ctx!.createBuffer(1, bufferSize, this.ctx!.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
          data[i] = Math.random() * 2 - 1;
      }
      const node = this.ctx!.createBufferSource();
      node.buffer = buffer;
      return node;
  }

  playHit() {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    
    // High pitched "Digital" blip
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'square'; 
    osc.frequency.setValueAtTime(1200, t);
    osc.frequency.linearRampToValueAtTime(600, t + 0.08); 
    
    gain.gain.setValueAtTime(0.15, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.1);
  }

  playExplosion() {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    
    // 1. Sub-bass drop (Shockwave)
    const sub = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(120, t);
    sub.frequency.exponentialRampToValueAtTime(10, t + 0.6);
    
    subGain.gain.setValueAtTime(1.0, t);
    subGain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    
    sub.connect(subGain);
    subGain.connect(this.sfxGain);
    sub.start(t);
    sub.stop(t + 0.6);

    // 2. Shattering Noise
    const noise = this.createNoiseBurst(0.4);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(3000, t);
    filter.frequency.linearRampToValueAtTime(100, t + 0.4);
    
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.5, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.sfxGain);
    noise.start(t);
  }

  playRockHit() {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    
    // Crystal chime sound instead of thud
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, t);
    osc.frequency.exponentialRampToValueAtTime(400, t + 0.3);
    
    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.3);
  }

  playWin() {
    if (!this.ctx || !this.sfxGain || !this.delayNode) return;
    const t = this.ctx.currentTime;
    // Futuristic Arpeggio Up
    const notes = [440, 554.37, 659.25, 880, 1108.73, 1318.51]; // A Major
    notes.forEach((freq, i) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        
        const startTime = t + i * 0.12;
        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(0.15, startTime + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 1.5);
        
        osc.connect(gain);
        gain.connect(this.delayNode!); 
        gain.connect(this.sfxGain!);
        
        osc.start(startTime);
        osc.stop(startTime + 2.0);
    });
  }

  playLose() {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    // Dark Descending Drone
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(100, t);
    osc1.frequency.linearRampToValueAtTime(30, t + 3.0);
    
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(104, t); // Detuned
    osc2.frequency.linearRampToValueAtTime(30, t + 3.0);

    gain.gain.setValueAtTime(0.4, t);
    gain.gain.linearRampToValueAtTime(0, t + 3.0);
    
    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.sfxGain);
    
    osc1.start(t);
    osc2.start(t);
    osc1.stop(t + 3.5);
    osc2.stop(t + 3.5);
  }
}

// A rock is now a cluster of spheres to form an irregular shape
interface RockSegment {
  id: number; 
  dx: number; 
  dy: number; 
  dz: number; 
  r: number;  
}

interface Rock {
  id: number;
  x: number;
  y: number;
  z: number;
  segments: RockSegment[];
  boundsRadius: number;
  hue: number; // Added hue for color
  rotation: number; // For visual variety
  rotationSpeed: number;
}

// Flattened sphere for the grid
interface GridSphere {
  x: number;
  y: number;
  z: number;
  r: number;
  rSq: number; 
}

// Jellyfish Interface
interface Jellyfish {
    id: number;
    x: number;
    y: number;
    z: number;
    angle: number; 
    targetAngle: number;
    baseSpeed: number; 
    currentSpeed: number; 
    size: number;
    noiseOffsetX: number;
    noiseOffsetY: number;
    swimTime: number; 
    colorHue: number;
    dead: boolean;
    targetRockId: number | null; 
    stunTimer: number;
    hp: number;
    maxHp: number; 
}

const FluidSimulation: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Ref to store the AI generated images
  const jellySpriteRef = useRef<HTMLImageElement | null>(null);
  const rockSpriteRef = useRef<HTMLImageElement | null>(null);
  const soundSystemRef = useRef<SoundSystem>(new SoundSystem());

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;
    
    const soundSystem = soundSystemRef.current;

    // --- Gemini API Integration ---
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    const generateJellyfishSprite = async () => {
      try {
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash-image',
          contents: {
            parts: [
              {
                text: 'A single glowing neon jellyfish, side view, facing upwards. Bioluminescent cyan and magenta colors, highly detailed, semi-transparent bell, isolated on a pure black background. Digital art style, game sprite.'
              },
            ],
          },
        });

        if (response.candidates && response.candidates[0].content.parts) {
          for (const part of response.candidates[0].content.parts) {
            if (part.inlineData) {
              const base64Str = part.inlineData.data;
              const img = new Image();
              img.src = `data:image/png;base64,${base64Str}`;
              img.onload = () => {
                jellySpriteRef.current = img;
              };
            }
          }
        }
      } catch (error) {
        console.error("Failed to generate jellyfish sprite:", error);
      }
    };

    const generateRockSprite = async () => {
      try {
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash-image',
          contents: {
            parts: [
              {
                // Updated prompt for Transparent Crystal Rocks
                text: 'A floating translucent crystal rock, glowing geometric mineral, sharp faceted edges, semi-transparent glass or ice texture, internal light refraction. Cyan and purple tint. Isolated on pure black background. 3D render game asset.'
              },
            ],
          },
        });

        if (response.candidates && response.candidates[0].content.parts) {
          for (const part of response.candidates[0].content.parts) {
            if (part.inlineData) {
              const base64Str = part.inlineData.data;
              const img = new Image();
              img.src = `data:image/png;base64,${base64Str}`;
              img.onload = () => {
                rockSpriteRef.current = img;
              };
            }
          }
        }
      } catch (error) {
        console.error("Failed to generate rock sprite:", error);
      }
    };

    // Trigger generation on mount
    generateJellyfishSprite();
    generateRockSprite();

    const simplex = new SimplexNoise();
    let animationFrameId: number;
    
    // Configuration
    const particleCount = 24000; 
    const gravity = 0.3;        
    const friction = 0.98; // Reduced friction for space float feel
    const noiseScale = 0.002;   
    const timeScale = 0.001;    
    
    // 3D Settings (Kept for code structure but largely unused in 2D mode)
    const focalLength = 600; 
    
    let w = 0;
    let h = 0;
    let cx = 0;
    let cy = 0;
    let time = 0;
    let rocks: Rock[] = [];
    let jellyfish: Jellyfish[] = [];
    let nextFishId = 0;
    let nextRockId = 0;
    let gameState: 'playing' | 'won' | 'lost' = 'playing';

    // Interaction State
    let isMouseDown = false;
    let chargeLevel = 0; 
    const MAX_CHARGE = 120; 
    let triggerExplosion = false;
    let explosionCenter = { x: 0, y: 0 };
    let explosionStrength = 0;
    
    // Slingshot / Aiming variables
    let dragStartX = -1000;
    let dragStartY = -1000;
    let explosionVector = { x: 0, y: 0 }; // Direction of the shot

    // Spatial Grid
    const CELL_SIZE = 50; 
    let gridCols = 0;
    let gridRows = 0;
    let collisionGrid: GridSphere[][] = []; 

    // Particle State: 
    // 0:x, 1:y, 2:z, 
    // 3:vx, 4:vy, 5:vz, 
    // 6:life, 7:hue, 8:type
    const STRIDE = 9;
    const particles = new Float32Array(particleCount * STRIDE);

    const TYPE_WATER = 0;
    const TYPE_FISH = 1;
    const TYPE_ROCK = 2;

    const createIrregularRock = (x: number, y: number, z: number, scaleMult: number = 1.0): Rock => {
        const segments: RockSegment[] = [];
        const baseSize = (60 + Math.random() * 30) * scaleMult; // Slightly larger base for sprite fitting
        
        // Create a more clustered shape to fit a sprite better
        const numSegments = 3 + Math.floor(Math.random() * 3);

        // Central core
        segments.push({ id: 0, dx: 0, dy: 0, dz: 0, r: baseSize });

        let maxDist = baseSize;

        for (let i = 0; i < numSegments; i++) {
            const angle = Math.random() * Math.PI * 2;
            // Reduce distance spread so sprite covers collider
            const dist = Math.random() * baseSize * 0.4; 
            const r = baseSize * (0.5 + Math.random() * 0.4);
            const dz = 0; 

            segments.push({
                id: i + 1,
                dx: Math.cos(angle) * dist,
                dy: Math.sin(angle) * dist * 0.5,
                dz: dz,
                r: r
            });
            
            const totalDist = dist + r;
            if (totalDist > maxDist) maxDist = totalDist;
        }

        return { 
            id: nextRockId++, 
            x, y, z, 
            segments, 
            boundsRadius: maxDist,
            hue: 180 + Math.random() * 100, // Cyan to Purple hues for crystals
            rotation: Math.random() * Math.PI * 2,
            // Variable rotation speed: random between -0.005 and 0.005 radians per frame
            rotationSpeed: (Math.random() - 0.5) * 0.01
        };
    };

    const buildSpatialGrid = () => {
        if (w === 0 || h === 0) return;
        
        const newCols = Math.ceil(w / CELL_SIZE);
        const newRows = Math.ceil(h / CELL_SIZE);
        
        // Initialize or clear grid
        if (newCols !== gridCols || newRows !== gridRows || collisionGrid.length === 0) {
            gridCols = newCols;
            gridRows = newRows;
            collisionGrid = new Array(gridCols * gridRows).fill(null).map(() => []);
        } else {
             // Fast clear without allocation
             for (let i = 0; i < collisionGrid.length; i++) {
                 collisionGrid[i].length = 0;
             }
        }

        rocks.forEach(rock => {
            // Pre-calculate rotation
            const cos = Math.cos(rock.rotation);
            const sin = Math.sin(rock.rotation);

            rock.segments.forEach(seg => {
                // Calculate rotated offset
                const rdx = seg.dx * cos - seg.dy * sin;
                const rdy = seg.dx * sin + seg.dy * cos;

                const ax = rock.x + rdx;
                const ay = rock.y + rdy;
                const az = rock.z + seg.dz;
                const r = seg.r;
                
                const minCol = Math.floor((ax - r) / CELL_SIZE);
                const maxCol = Math.floor((ax + r) / CELL_SIZE);
                const minRow = Math.floor((ay - r) / CELL_SIZE);
                const maxRow = Math.floor((ay + r) / CELL_SIZE);

                const sphere: GridSphere = { x: ax, y: ay, z: az, r, rSq: r * r };

                for (let c = Math.max(0, minCol); c <= Math.min(gridCols - 1, maxCol); c++) {
                    for (let row = Math.max(0, minRow); row <= Math.min(gridRows - 1, maxRow); row++) {
                        const idx = row * gridCols + c;
                        if (collisionGrid[idx]) {
                             collisionGrid[idx].push(sphere);
                        }
                    }
                }
            });
        });
    };

    const initRocks = () => {
        rocks = [];
        const numberOfRocks = 5; 
        const padding = 100; // Keep rocks somewhat away from edges

        for (let i = 0; i < numberOfRocks; i++) {
            // Random position across the entire screen
            const xPos = padding + Math.random() * (w - padding * 2);
            const yPos = padding + Math.random() * (h - padding * 2);
            const zPos = 0; 
            
            rocks.push(createIrregularRock(xPos, yPos, zPos));
        }

        buildSpatialGrid();
    };

    const initJellyfish = () => {
        jellyfish = [];
        const count = 30; // Increased density
        const spawnMargin = 150;

        for(let i=0; i<count; i++) {
            let startX, startY, startAngle;
            
            // Randomly pick a side: 0=Top, 1=Right, 2=Bottom, 3=Left
            const side = Math.floor(Math.random() * 4);
            
            switch(side) {
                case 0: // Top
                    startX = Math.random() * w;
                    startY = -spawnMargin;
                    startAngle = Math.PI / 2; // Face Down
                    break;
                case 1: // Right
                    startX = w + spawnMargin;
                    startY = Math.random() * h;
                    startAngle = Math.PI; // Face Left
                    break;
                case 2: // Bottom
                    startX = Math.random() * w;
                    startY = h + spawnMargin;
                    startAngle = -Math.PI / 2; // Face Up
                    break;
                default: // Left
                    startX = -spawnMargin;
                    startY = Math.random() * h;
                    startAngle = 0; // Face Right
                    break;
            }

            jellyfish.push({
                id: nextFishId++,
                x: startX, 
                y: startY, 
                z: 0,
                angle: startAngle, 
                targetAngle: startAngle,
                // Randomize speed: Some slow drifters, some fast attackers
                baseSpeed: 0.3 + Math.random() * 1.5, 
                currentSpeed: 0,
                size: 0.8 + Math.random() * 0.4,
                noiseOffsetX: Math.random() * 1000,
                noiseOffsetY: Math.random() * 1000,
                swimTime: Math.random() * 100, 
                colorHue: 160 + Math.random() * 140, 
                dead: false,
                targetRockId: null,
                stunTimer: 0,
                hp: 100,
                maxHp: 100
            });
        }
    };

    const resetParticle = (i: number, fullReset: boolean = false) => {
        const idx = i * STRIDE;
        
        // Randomly position particle anywhere in the 2D space
        particles[idx] = Math.random() * w;
        particles[idx + 1] = Math.random() * h;
        particles[idx + 2] = 0; // Flattened Z

        particles[idx + 3] = (Math.random() - 0.5) * 0.5; // Gentle initial drift
        particles[idx + 4] = (Math.random() - 0.5) * 0.5; 
        particles[idx + 5] = 0; // Flattened Z velocity
        
        particles[idx + 6] = 0; 
        particles[idx + 7] = Math.random(); 
        particles[idx + 8] = TYPE_WATER; 
    };

    const spawnDebris = (x: number, y: number, z: number, type: number, hue: number, burstMultiplier: number = 1.0) => {
        let count = 0;
        const maxSpawn = 60 * burstMultiplier; // Increased default spawn
        if (type === TYPE_ROCK) soundSystem.playRockHit();

        for (let i = 0; i < particleCount; i += 2) { // Check more frequently
            if (count >= maxSpawn) break;
            
            const idx = i * STRIDE;
            if (particles[idx + 8] === TYPE_WATER) {
                count++;
                
                particles[idx] = x + (Math.random() - 0.5) * 20 * burstMultiplier;
                particles[idx + 1] = y + (Math.random() - 0.5) * 20 * burstMultiplier;
                particles[idx + 2] = 0; // Flattened
                
                const speed = (4 + Math.random() * 8) * burstMultiplier;
                const angle = Math.random() * Math.PI * 2;
                particles[idx + 3] = Math.cos(angle) * speed;
                particles[idx + 4] = Math.sin(angle) * speed;
                particles[idx + 5] = 0; // Flattened
                
                particles[idx + 6] = 1.2; // Longer life
                particles[idx + 7] = hue; 
                particles[idx + 8] = type;
            }
        }
    };

    const spawnTrailParticle = (jelly: Jellyfish) => {
        // Spawn a single faint particle from the jellyfish for a trail effect
        for (let i = 0; i < particleCount; i += 10) {
            const idx = i * STRIDE;
            if (particles[idx + 8] === TYPE_WATER && particles[idx + 6] <= 0) {
                const r = Math.random() * 15 * jelly.size;
                const theta = Math.random() * Math.PI * 2;
                
                particles[idx] = jelly.x + Math.cos(theta) * r;
                particles[idx + 1] = jelly.y + Math.sin(theta) * r;
                particles[idx + 2] = 0; // Flattened
                
                particles[idx + 3] = (Math.random() - 0.5) * 0.5;
                particles[idx + 4] = (Math.random() - 0.5) * 0.5;
                particles[idx + 5] = 0; // Flattened
                
                particles[idx + 6] = 0.5; // Short life
                particles[idx + 7] = jelly.colorHue;
                particles[idx + 8] = TYPE_FISH; // Reuse fish type for colored particles
                break; // Just one per frame per jelly max
            }
        }
    };

    const explodeJellyIntoParticles = (jelly: Jellyfish) => {
        let particlesFound = 0;
        const particlesNeeded = 600;
        soundSystem.playExplosion();
        
        for (let i = 0; i < particleCount; i++) {
            if (particlesFound >= particlesNeeded) break;
            
            const idx = i * STRIDE;
            if (particles[idx + 8] === TYPE_WATER || (particles[idx+8] === TYPE_FISH && particles[idx+6] < 0.2)) {
                particlesFound++;
                
                const theta = Math.random() * Math.PI * 2;
                const r = Math.random() * 25 * jelly.size;
                
                particles[idx] = jelly.x + Math.cos(theta) * r;
                particles[idx + 1] = jelly.y + Math.sin(theta) * r;
                particles[idx + 2] = 0; // Flattened
                
                const speed = 5 + Math.random() * 15;
                const angle = Math.random() * Math.PI * 2;
                particles[idx + 3] = Math.cos(angle) * speed;
                particles[idx + 4] = Math.sin(angle) * speed;
                particles[idx + 5] = 0; // Flattened
                
                particles[idx + 6] = 1.0;
                particles[idx + 7] = jelly.colorHue;
                particles[idx + 8] = TYPE_FISH;
            }
        }
    };

    const initParticles = () => {
        for (let i = 0; i < particleCount; i++) {
            resetParticle(i, true);
        }
    };

    // Mouse Physics State
    let mouseX = -1000;
    let mouseY = -1000;
    let lastMouseX = -1000;
    let lastMouseY = -1000;
    let mouseVx = 0;
    let mouseVy = 0;

    const handleMouseMove = (e: MouseEvent) => {
        const x = e.clientX;
        const y = e.clientY;
        
        if (lastMouseX === -1000) {
            lastMouseX = x;
            lastMouseY = y;
        }

        mouseVx = x - lastMouseX;
        mouseVy = y - lastMouseY;
        
        lastMouseX = x;
        lastMouseY = y;
        mouseX = x;
        mouseY = y;
    };

    const handleMouseDown = () => {
        soundSystem.resume();
        if (gameState !== 'playing') {
             // Reset game on click if over
             if (rocks.length === 0) {
                 initRocks();
                 initJellyfish();
                 gameState = 'playing';
             } else if (jellyfish.length === 0) {
                 initRocks();
                 initJellyfish();
                 gameState = 'playing';
             }
             return;
        }
        isMouseDown = true;
        chargeLevel = 0;
        // Start aiming from current mouse pos
        dragStartX = mouseX;
        dragStartY = mouseY;
        soundSystem.startCharge();
    };

    const handleMouseUp = () => {
        if (isMouseDown) {
             triggerExplosion = true;
             explosionCenter = { x: mouseX, y: mouseY };
             explosionStrength = chargeLevel;
             // Aim vector is Start - End (Pulling back like a slingshot)
             // If I drag mouse LEFT (End < Start), Vector is Positive (Shoot Right)
             explosionVector.x = dragStartX - mouseX;
             explosionVector.y = dragStartY - mouseY;
             
             soundSystem.playShoot(chargeLevel / MAX_CHARGE);
        }
        isMouseDown = false;
        chargeLevel = 0;
        soundSystem.stopCharge();
    };

    const handleTouchMove = (e: TouchEvent) => {
        if (e.touches.length > 0) {
            const x = e.touches[0].clientX;
            const y = e.touches[0].clientY;

             if (lastMouseX === -1000) {
                lastMouseX = x;
                lastMouseY = y;
            }

            mouseVx = x - lastMouseX;
            mouseVy = y - lastMouseY;

            lastMouseX = x;
            lastMouseY = y;
            mouseX = x;
            mouseY = y;
        }
    };

    const handleTouchStart = (e: TouchEvent) => {
        soundSystem.resume();
        if (gameState !== 'playing') {
             if (rocks.length === 0 || jellyfish.length === 0) {
                 initRocks();
                 initJellyfish();
                 gameState = 'playing';
             }
             return;
        }
        isMouseDown = true;
        chargeLevel = 0;
        soundSystem.startCharge();
        
        if (e.touches.length > 0) {
            const x = e.touches[0].clientX;
            const y = e.touches[0].clientY;
            lastMouseX = x; lastMouseY = y;
            mouseX = x; mouseY = y;
            mouseVx = 0; mouseVy = 0;
            dragStartX = x;
            dragStartY = y;
        }
    };

    const handleTouchEnd = () => {
         if (isMouseDown) {
             triggerExplosion = true;
             explosionCenter = { x: mouseX, y: mouseY };
             explosionStrength = chargeLevel;
             explosionVector.x = dragStartX - mouseX;
             explosionVector.y = dragStartY - mouseY;
             soundSystem.playShoot(chargeLevel / MAX_CHARGE);
        }
        isMouseDown = false;
        chargeLevel = 0;
        soundSystem.stopCharge();
    };

    const resolveSphereCollision = (
        idx: number, 
        sx: number, sy: number, sz: number, radius: number, rSq: number,
        flowOver: boolean
    ) => {
        const x = particles[idx];
        const y = particles[idx + 1];
        // Flattened Z access
        const z = 0; // particles[idx + 2]; 
        
        const dx = x - sx;
        const dy = y - sy;
        // Flattened distance calc
        const dz = 0; // z - sz;
        const distSq = dx*dx + dy*dy + dz*dz;
        
        const minDist = radius + 1;
        const minDistSq = minDist * minDist;

        if (distSq < minDistSq) {
            const dist = Math.sqrt(distSq) || 0.001; // Prevent div/0
            const nx = dx / dist;
            const ny = dy / dist;
            const nz = dz / dist;

            const penetration = minDist - dist;
            particles[idx] += nx * penetration;
            particles[idx + 1] += ny * penetration;
            // Flattened: No Z adjustment
            // particles[idx + 2] += nz * penetration;

            particles[idx + 3] *= 0.3; 
            particles[idx + 4] *= 0.3;
            particles[idx + 5] *= 0.3;

            particles[idx + 3] += nx * 0.5; 
            particles[idx + 4] += ny * 0.5;
            // particles[idx + 5] += nz * 0.5;

            if (flowOver && ny < -0.1) {
                particles[idx + 3] += nx * 0.5; 
                // particles[idx + 5] -= 0.8; 
            }
            return true;
        }
        return false;
    };

    const drawJellyfish = (jelly: Jellyfish) => {
        // Flattened Scale
        const scale = 1.0; 
        
        const screenX = (jelly.x - cx) * scale + cx;
        const screenY = (jelly.y - cy) * scale + cy;

        ctx.save();
        ctx.translate(screenX, screenY);
        
        // Align the jellyfish so 'right' is forward
        // Add a slight "wobble" to the rotation based on swim cycle
        const wobble = Math.sin(jelly.swimTime * 2.0) * 0.15;
        ctx.rotate(jelly.angle + wobble);
        
        ctx.scale(scale * jelly.size, scale * jelly.size);

        const isStunned = jelly.stunTimer > 0;
        const flicker = isStunned && Math.floor(time * 20) % 2 === 0;

        // Swim animation pulse
        const squeezeAmt = Math.max(0, Math.sin(jelly.swimTime)); 
        
        // If the Gemini image is loaded, use it
        if (jellySpriteRef.current) {
             // Apply squash and stretch to the sprite
             const stretchX = 1.0 - squeezeAmt * 0.15;
             const stretchY = 1.0 + squeezeAmt * 0.2;
             ctx.scale(stretchX, stretchY);

             // Rotate correction: The sprite is generated "facing up", rotate 90deg
             ctx.rotate(Math.PI / 2);

             const size = 120; // Base sprite draw size
             
             // Use screen blending to make black background transparent
             ctx.globalCompositeOperation = 'screen';
             
             // --- DYNAMIC STYLING ---
             // Use CSS filters on the context to tint the specific jellyfish 
             // and pulse its brightness
             const pulseBrightness = 1.0 + squeezeAmt * 0.4; 
             const hueRot = jelly.colorHue - 180; // Assuming sprite base is ~180 (Cyan)
             
             let filterStr = `hue-rotate(${hueRot}deg) brightness(${pulseBrightness})`;
             if (isStunned) {
                 filterStr += ` brightness(3.0) contrast(0.5)`; // Flash white
             }
             ctx.filter = filterStr;

             if (flicker) ctx.globalAlpha = 0.5;
             else ctx.globalAlpha = 0.9;

             // Draw Glow behind
             const glowGrad = ctx.createRadialGradient(0,0, 0, 0,0, size*0.6);
             glowGrad.addColorStop(0, `hsla(${jelly.colorHue}, 100%, 50%, 0.5)`);
             glowGrad.addColorStop(1, `hsla(${jelly.colorHue}, 100%, 50%, 0)`);
             ctx.fillStyle = glowGrad;
             ctx.beginPath();
             ctx.arc(0,0, size*0.6, 0, Math.PI*2);
             ctx.fill();

             ctx.drawImage(jellySpriteRef.current, -size/2, -size/2, size, size);
             
             // Reset filter
             ctx.filter = 'none';

        } else {
            // --- FALLBACK: Procedural Drawing ---
            // Enhanced with the same dynamics
            const hue = jelly.colorHue;
            const bellW = 45 - (squeezeAmt * 15); 
            const bellH = 25 + (squeezeAmt * 12);
            const speedFactor = jelly.currentSpeed; 
            const rimCurl = squeezeAmt * 15; 

            // Tentacles
            ctx.globalCompositeOperation = 'screen';
            ctx.lineCap = 'round';
            
            const numTentacles = 8;
            for(let i=0; i<numTentacles; i++) {
                const tOffsetY = (i - numTentacles/2 + 0.5) * (bellW / numTentacles * 1.5);
                
                ctx.beginPath();
                const attachX = -5; 
                ctx.moveTo(attachX, tOffsetY); 

                const drag = speedFactor * 25; 
                
                const wave1 = Math.sin(jelly.swimTime * 3 + i + jelly.y*0.01) * (10 - speedFactor*2);
                const wave2 = Math.cos(jelly.swimTime * 2 + i) * (8 - speedFactor*2);
                
                const cp1x = attachX - 20 - drag;
                const cp1y = tOffsetY + wave1;
                
                const cp2x = attachX - 50 - drag * 1.5;
                const cp2y = tOffsetY * 1.5 + wave2;
                
                const endX = attachX - 80 - drag * 2.0 - Math.random()*5;
                const endY = tOffsetY * 2.2 + wave1 * 0.5;

                ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, endX, endY);
                
                ctx.lineWidth = 1.5;
                
                const gradT = ctx.createLinearGradient(attachX, 0, endX, 0);
                const tentacleHue = flicker ? 0 : hue;
                const tentacleSat = flicker ? 0 : 70;
                gradT.addColorStop(0, `hsla(${tentacleHue}, ${tentacleSat}%, 60%, 0.4)`);
                gradT.addColorStop(1, `hsla(${tentacleHue}, ${tentacleSat}%, 60%, 0.0)`);
                
                ctx.strokeStyle = gradT;
                ctx.stroke();
            }

            // Bell
            const bodyHue = flicker ? 0 : hue;
            const bodySat = flicker ? 0 : 80;
            const bodyLit = flicker ? 90 : 50; 
            // Pulse brightness
            const dynLit = bodyLit + (squeezeAmt * 20);

            const grad = ctx.createRadialGradient(-10, 0, 0, -10, 0, bellW);
            grad.addColorStop(0, `hsla(${bodyHue}, 90%, 95%, 0.4)`); 
            grad.addColorStop(0.4, `hsla(${bodyHue}, ${bodySat}%, 60%, 0.2)`);
            grad.addColorStop(1, `hsla(${bodyHue}, ${bodySat}%, ${dynLit}%, 0.05)`); 

            ctx.fillStyle = grad;
            ctx.beginPath();
            
            ctx.moveTo(0, -bellH); 
            
            const noseX = bellW * 1.2; 
            ctx.bezierCurveTo(noseX * 0.6, -bellH, noseX, -bellH * 0.5, noseX, 0);
            ctx.bezierCurveTo(noseX, bellH * 0.5, noseX * 0.6, bellH, 0, bellH);

            const rimIndentation = 10 + rimCurl; 
            ctx.bezierCurveTo(-rimIndentation, bellH * 0.6, -rimIndentation, -bellH * 0.6, 0, -bellH);
            
            ctx.fill();
            
            ctx.strokeStyle = `hsla(${bodyHue}, 90%, 80%, 0.15)`;
            ctx.lineWidth = 2;
            ctx.stroke();

            // Organs
            ctx.fillStyle = `hsla(${bodyHue}, 100%, 85%, 0.35)`;
            ctx.beginPath();
            const organW = bellW * 0.4;
            const organH = bellH * 0.3;
            ctx.ellipse(15, 0, organW, organH, 0, 0, Math.PI*2);
            ctx.fill();
        }

        ctx.restore();

        // --- RENDER HEALTH BAR ---
        if (jelly.hp > 0) {
            // Position the health bar above the jellyfish in screen space
            const barWidth = 60 * scale * jelly.size;
            const barHeight = 5 * scale * jelly.size;
            const yOffset = 70 * scale * jelly.size; // Shift up based on size
            
            const barX = screenX - barWidth / 2;
            const barY = screenY - yOffset;

            // Background
            ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
            ctx.fillRect(barX, barY, barWidth, barHeight);

            // Health Fill
            const hpPercent = Math.max(0, jelly.hp / jelly.maxHp);
            
            if (hpPercent > 0.5) ctx.fillStyle = '#4ade80'; // Green
            else if (hpPercent > 0.25) ctx.fillStyle = '#facc15'; // Yellow
            else ctx.fillStyle = '#f87171'; // Red
            
            // Leave 1px border
            ctx.fillRect(barX + 1, barY + 1, (barWidth - 2) * hpPercent, barHeight - 2);
        }
    };

    const drawGameOverlay = () => {
         if (gameState === 'playing') return;

         ctx.save();
         ctx.fillStyle = 'rgba(0, 20, 40, 0.85)';
         ctx.fillRect(0, 0, w, h);

         ctx.textAlign = 'center';
         ctx.textBaseline = 'middle';
         
         if (gameState === 'won') {
             ctx.font = 'bold 60px serif';
             ctx.fillStyle = '#4ade80'; 
             ctx.fillText('REEF SAVED', cx, cy - 30);
             ctx.font = '24px sans-serif';
             ctx.fillStyle = '#bbf7d0';
             ctx.fillText('All jellyfish eliminated', cx, cy + 20);
         } else {
             ctx.font = 'bold 60px serif';
             ctx.fillStyle = '#f87171'; 
             ctx.fillText('REEF DESTROYED', cx, cy - 30);
             ctx.font = '24px sans-serif';
             ctx.fillStyle = '#fca5a5';
             ctx.fillText('The rocks have crumbled', cx, cy + 20);
         }
         
         ctx.font = '16px sans-serif';
         ctx.fillStyle = '#ffffff';
         ctx.fillText('Click or Tap to Play Again', cx, h - 80);
         
         ctx.restore();
    };

    const draw = () => {
        // Background - Reduced opacity for cleaner trails in zero-G
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = 'rgba(0, 0, 0, 0.2)'; 
        ctx.fillRect(0, 0, w, h);

        if (gameState !== 'playing') {
            drawGameOverlay();
            animationFrameId = requestAnimationFrame(draw);
            return;
        }

        time += timeScale;

        if (isMouseDown) {
            chargeLevel = Math.min(chargeLevel + 0.8, MAX_CHARGE);
            soundSystem.updateCharge(chargeLevel, MAX_CHARGE);
        }
        
        mouseVx *= 0.9;
        mouseVy *= 0.9;

        // Draw Rocks & Logic
        // Filter out rocks that have no segments left
        rocks = rocks.filter(r => r.segments.length > 0);

        // Lose Condition Check
        if (rocks.length === 0) {
            soundSystem.playLose();
            gameState = 'lost';
        }

        for (const rock of rocks) {
             const scale = 1.0; // Flattened scale
             rock.rotation += rock.rotationSpeed;
             
             if (rockSpriteRef.current) {
                 // --- DRAW CRYSTAL SPRITE ---
                 // Use 'screen' blend for transparent/glowing glass look
                 ctx.globalCompositeOperation = 'screen';
                 
                 const rockX = (rock.x - cx) * scale + cx;
                 const rockY = (rock.y - cy) * scale + cy;
                 
                 // Size multiplier to make the sprite cover the collision segments well
                 const drawSize = rock.boundsRadius * 2.6; 
                 
                 ctx.save();
                 ctx.translate(rockX, rockY);
                 ctx.rotate(rock.rotation);
                 
                 // Slight pulsating glow for crystals
                 ctx.globalAlpha = 0.9 + Math.sin(time * 2) * 0.1;

                 ctx.drawImage(
                     rockSpriteRef.current, 
                     -drawSize / 2, 
                     -drawSize / 2, 
                     drawSize, 
                     drawSize
                 );
                 
                 ctx.restore();
                 ctx.globalCompositeOperation = 'source-over';
                 ctx.globalAlpha = 1.0;
                 ctx.shadowBlur = 0;

             } else {
                 // --- FALLBACK: DRAW PROCEDURAL CRYSTAL ---
                 ctx.save();
                 const rockX = (rock.x - cx) * scale + cx;
                 const rockY = (rock.y - cy) * scale + cy;
                 ctx.translate(rockX, rockY);
                 ctx.rotate(rock.rotation);

                 // Crystal style: Screen blend mode + semi-transparent fill + sharp strokes
                 ctx.globalCompositeOperation = 'screen';
                 
                 for (const seg of rock.segments) {
                     // 1. Main Body (Transparent Glassy)
                     ctx.fillStyle = `hsla(${rock.hue}, 60%, 60%, 0.2)`; // Low alpha fill
                     ctx.beginPath();
                     ctx.arc(seg.dx * scale, seg.dy * scale, seg.r * scale, 0, Math.PI * 2);
                     ctx.fill();
                     
                     // 2. Edge/Refraction (Bright Stroke)
                     ctx.strokeStyle = `hsla(${rock.hue}, 80%, 80%, 0.5)`;
                     ctx.lineWidth = 2;
                     ctx.stroke();

                     // 3. Specular Highlight (White spot)
                     ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
                     ctx.beginPath();
                     // Offset highlight to top-left relative to center
                     ctx.arc(
                         seg.dx * scale - seg.r * 0.3, 
                         seg.dy * scale - seg.r * 0.3, 
                         seg.r * 0.2, 
                         0, Math.PI * 2
                     );
                     ctx.fill();
                 }
                 ctx.restore();
                 ctx.globalCompositeOperation = 'source-over';
             }
        }
        
        // Rebuild grid every frame to account for rock rotation
        buildSpatialGrid();

        // Update & Draw Jellyfish
        jellyfish.forEach(jelly => {
            if (jelly.stunTimer > 0) {
                jelly.stunTimer--;
                jelly.x += (Math.random() - 0.5) * 0.5;
                jelly.y -= 0.5; 
            } else {
                // AI: Seek Rocks
                if (rocks.length > 0) {
                    let targetRock = rocks.find(r => r.id === jelly.targetRockId);
                    if (!targetRock) {
                        const randomRock = rocks[Math.floor(Math.random() * rocks.length)];
                        jelly.targetRockId = randomRock.id;
                        targetRock = randomRock;
                    }

                    if (targetRock) {
                        const dx = targetRock.x - jelly.x;
                        const dy = targetRock.y - jelly.y;
                        const angleToRock = Math.atan2(dy, dx);
                        
                        let angleDiff = angleToRock - jelly.targetAngle;
                        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
                        
                        jelly.targetAngle += angleDiff * 0.05;
                    }
                }

                jelly.swimTime += 0.06; 
                
                const nx = simplex.noise3D(jelly.noiseOffsetX, time * 0.5, 0);
                // Removed nY for Z-axis noise
                
                jelly.targetAngle += nx * 0.02;
                
                let diff = jelly.targetAngle - jelly.angle;
                while (diff > Math.PI) diff -= Math.PI * 2;
                while (diff < -Math.PI) diff += Math.PI * 2;
                jelly.angle += diff * 0.08; 

                const cycle = jelly.swimTime % (Math.PI * 2);
                let propulsion = 0;
                if (cycle < Math.PI) propulsion = Math.pow(Math.sin(cycle), 2); 
                
                const targetSpeed = jelly.baseSpeed * 0.2 + (propulsion * jelly.baseSpeed * 5.0);
                jelly.currentSpeed += (targetSpeed - jelly.currentSpeed) * 0.1;
                
                jelly.x += Math.cos(jelly.angle) * jelly.currentSpeed;
                jelly.y += Math.sin(jelly.angle) * jelly.currentSpeed;
                
                // Flattened: No Z movement
                // jelly.z += ny * 0.2;
                // if (jelly.z > 100) jelly.z -= 0.5;
                // if (jelly.z < -100) jelly.z += 0.5;

                // Trail
                if (propulsion > 0.8) {
                    spawnTrailParticle(jelly);
                }
            }

            const margin = 100;
            // Expanded logic to handle "returning" to play area if they go too far off screen
            // but primarily they should be seeking rocks inwards.
            if (jelly.x < -margin * 2) { jelly.angle = 0; }
            if (jelly.x > w + margin * 2) { jelly.angle = Math.PI; }
            if (jelly.y < -margin * 2) { jelly.angle = Math.PI/2; }
            if (jelly.y > h + margin * 2) { jelly.angle = -Math.PI/2; }

            if (!isMouseDown && mouseX > -500 && jelly.stunTimer <= 0) {
                const dx = jelly.x - mouseX;
                const dy = jelly.y - mouseY;
                const d2 = dx*dx + dy*dy;
                if (d2 < 20000) { 
                    const dist = Math.sqrt(d2) || 0.1;
                    const push = (140 - dist) * 0.01;
                    jelly.x += (dx/dist) * push;
                    jelly.y += (dy/dist) * push;
                }
            }

            // Rock Collision / Eating
            if (jelly.stunTimer <= 0) {
                const headX = jelly.x + Math.cos(jelly.angle) * 25 * jelly.size;
                const headY = jelly.y + Math.sin(jelly.angle) * 25 * jelly.size;
                const headZ = jelly.z;

                // Only check if rocks exist
                if (rocks.length > 0) {
                    const rock = rocks.find(r => r.id === jelly.targetRockId) || rocks[0];
                    if (rock) {
                        // Check collision with ROTATED segments
                        const jellyTouchRadius = 35 * jelly.size;
                        const cos = Math.cos(rock.rotation);
                        const sin = Math.sin(rock.rotation);

                        for (let i = 0; i < rock.segments.length; i++) {
                            const seg = rock.segments[i];
                            // Calculate Rotated World Position of this Segment
                            const rdx = seg.dx * cos - seg.dy * sin;
                            const rdy = seg.dx * sin + seg.dy * cos;
                            const segX = rock.x + rdx;
                            const segY = rock.y + rdy;

                            const dx = jelly.x - segX;
                            const dy = jelly.y - segY;
                            const dz = 0; // Flattened
                            const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
                            
                            // Check collision against segment radius
                            if (dist < seg.r + jellyTouchRadius) {
                                const impactX = segX;
                                const impactY = segY;
                                const impactZ = 0;

                                // Violent debris explosion - use Rock's hue
                                spawnDebris(impactX, impactY, impactZ, TYPE_ROCK, rock.hue, 8.0); 
                                
                                // Area Damage: Destroy nearby segments in this rock
                                // Use Local Space Distance to filter (Distance invariant under rotation)
                                const destructionRadius = 12 * jelly.size; 
                                const destructionRadiusSq = destructionRadius * destructionRadius;
                                const hitSegDx = seg.dx;
                                const hitSegDy = seg.dy;

                                const originalCount = rock.segments.length;
                                rock.segments = rock.segments.filter(s => {
                                    // Compare local coordinates relative to the hit segment
                                    const dSq = (s.dx - hitSegDx)**2 + (s.dy - hitSegDy)**2;
                                    return dSq > destructionRadiusSq;
                                });
                                
                                // Reduced stun and recoil to lower rock resistance
                                jelly.stunTimer = 100; // Increased to make them attack less frequently
                                jelly.currentSpeed = -4.0; // Increased recoil
                                jelly.swimTime = 0;
                                break; 
                            }
                        }
                    }
                }
            }

            drawJellyfish(jelly);
        });
        
        // Calculate aim angle if needed for directional blast
        let blastAngle = 0;
        let isDirectionalBlast = false;
        
        if (triggerExplosion) {
            const dragDistSq = explosionVector.x * explosionVector.x + explosionVector.y * explosionVector.y;
            // Only shoot if dragged enough (aimed). Threshold ~20px
            if (dragDistSq > 400) { 
                 isDirectionalBlast = true;
                 blastAngle = Math.atan2(explosionVector.y, explosionVector.x);
            } else {
                triggerExplosion = false; // Cancel shot if not aimed
            }
        }

        // Particles
        ctx.globalCompositeOperation = 'lighter';

        for (let i = 0; i < particleCount; i++) {
            const idx = i * STRIDE;
            const pType = particles[idx + 8];
            
            if (pType === TYPE_WATER) {
                // ZERO GRAVITY for water:
                // Instead of falling, particles drift in all directions (X, Y) via noise
                
                const nX = simplex.noise3D(particles[idx] * noiseScale, particles[idx + 1] * noiseScale, time);
                const nY = simplex.noise3D(particles[idx] * noiseScale + 1000, particles[idx + 1] * noiseScale + 1000, time);
                // Removed nZ for 2D
                
                particles[idx + 3] += nX * 0.02; // VX
                particles[idx + 4] += nY * 0.02; // VY
                // particles[idx + 5] += nZ * 0.02; // VZ - REMOVED
                
                // Calculate angle for color only
                const angle = Math.atan2(particles[idx+4], particles[idx+3]);
                const speed = Math.sqrt(particles[idx+3]**2 + particles[idx+4]**2);
                particles[idx + 7] = (angle * 180 / Math.PI) + 180; // Use hue for vector visual, not physics

                if (particles[idx + 6] > 0) particles[idx + 6] -= 0.05;

            } else if (pType === TYPE_FISH) {
                particles[idx + 4] += gravity * 0.2; // Fish parts slightly sink
                particles[idx + 3] *= 0.95;
                particles[idx + 4] *= 0.95;
                particles[idx + 5] *= 0.95;
                particles[idx + 6] -= 0.008; 
                if (particles[idx + 6] <= 0) {
                    resetParticle(i);
                    continue;
                }
            } else if (pType === TYPE_ROCK) {
                particles[idx + 4] += gravity * 0.8; // Rocks sink fast
                particles[idx + 3] *= 0.9;
                particles[idx + 5] *= 0.9;
                particles[idx + 6] -= 0.015;
                 if (particles[idx + 6] <= 0) {
                    resetParticle(i);
                    continue;
                }
            }

            // Blast Logic
            if (triggerExplosion) {
                const ex = particles[idx] - explosionCenter.x;
                const ey = particles[idx + 1] - explosionCenter.y;
                const d2 = ex*ex + ey*ey;
                const blastRadius = 20 + explosionStrength * 2.5; 
                const blastRadiusSq = blastRadius * blastRadius;

                if (d2 < blastRadiusSq) {
                    
                    if (isDirectionalBlast) {
                         // Directional Shot (Cone of ~15 degrees)
                         // Random spread between -7.5 deg and +7.5 deg
                         const spread = (Math.random() - 0.5) * (15 * Math.PI / 180); 
                         const finalAngle = blastAngle + spread;
                         
                         // Force calculation - Increased Power
                         const force = (15 + (explosionStrength / MAX_CHARGE) * 60) * (0.8 + Math.random()*0.4);
                         
                         // Override velocity for "shot" feel
                         particles[idx + 3] = Math.cos(finalAngle) * force;
                         particles[idx + 4] = Math.sin(finalAngle) * force;
                         particles[idx + 5] = 0; // Flattened
                         
                         if (pType === TYPE_WATER && explosionStrength > 5) {
                            particles[idx + 6] = 1.0; // Activate damage
                         }

                    }
                }
            }

            // Collision with Jellyfish
            const vx = particles[idx + 3];
            const vy = particles[idx + 4];
            const vz = particles[idx + 5];
            const speedSq = vx*vx + vy*vy + vz*vz;
            
            const isLethal = pType === TYPE_WATER && particles[idx + 6] > 0.2;

            if (!isMouseDown && isLethal && speedSq > 100) { 
                for (const jelly of jellyfish) {
                    if (jelly.dead) continue;

                    // --- Hitbox Logic ---
                    let hitConfirmed = false;
                    let damage = 4; // Default damage (Body/Tail/Side)

                    // 1. Head Sphere Check
                    const headRadius = 35 * jelly.size;
                    const hdx = particles[idx] - jelly.x;
                    const hdy = particles[idx + 1] - jelly.y;
                    const hdz = 0; // Flattened
                    
                    if (Math.abs(hdx) < headRadius && Math.abs(hdy) < headRadius && Math.abs(hdz) < headRadius) {
                         const hDistSq = hdx*hdx + hdy*hdy + hdz*hdz;
                         if (hDistSq < headRadius * headRadius) {
                             hitConfirmed = true;
                             
                             // Calculate Alignment for Critical Hit on Head
                             const dist = Math.sqrt(hDistSq) || 1;
                             const nx = hdx / dist;
                             const ny = hdy / dist;
                             const headX = Math.cos(jelly.angle);
                             const headY = Math.sin(jelly.angle);
                             const alignment = nx * headX + ny * headY;

                             if (alignment > 0.4) {
                                 damage = 12; // Critical Hit (Front of Head)
                             }
                         }
                    }

                    // 2. Tail Sphere Check (if Head missed)
                    if (!hitConfirmed) {
                        const tailOffset = 40 * jelly.size; 
                        const tx = jelly.x - Math.cos(jelly.angle) * tailOffset;
                        const ty = jelly.y - Math.sin(jelly.angle) * tailOffset;
                        const tz = 0; // Flattened
                        const tailRadius = 30 * jelly.size;

                        const tdx = particles[idx] - tx;
                        const tdy = particles[idx + 1] - ty;
                        const tdz = 0; // Flattened

                        if (Math.abs(tdx) < tailRadius && Math.abs(tdy) < tailRadius && Math.abs(tdz) < tailRadius) {
                             const tDistSq = tdx*tdx + tdy*tdy + tdz*tdz;
                             if (tDistSq < tailRadius * tailRadius) {
                                 hitConfirmed = true;
                                 damage = 4; // Standard damage for tail/back
                             }
                        }
                    }

                    if (hitConfirmed) { 
                         jelly.hp -= damage; 
                         jelly.stunTimer = 5; 
                         soundSystem.playHit();
                         
                         if (jelly.hp <= 0) {
                            jelly.dead = true;
                         }
                         
                         particles[idx + 3] *= -0.5;
                         particles[idx + 4] *= -0.5;
                         particles[idx + 5] *= -0.5;
                         break;
                    }
                }
            }

            // Interaction
            if (mouseX > -500 && pType === TYPE_WATER) {
                const mx = mouseX;
                const my = mouseY;
                const dx = particles[idx] - mx;
                const dy = particles[idx + 1] - my;
                const distSq = dx*dx + dy*dy;

                if (isMouseDown) {
                    const attractionRadius = 60 + chargeLevel * 3.5;
                    const attractionRSq = attractionRadius * attractionRadius;

                    if (distSq < attractionRSq) {
                        const dist = Math.sqrt(distSq) || 0.1;
                        const nx = dx / dist;
                        const ny = dy / dist;
                        
                        const pullStrength = 0.5 + (chargeLevel / MAX_CHARGE) * 3.5;
                        const force = (1 - dist / attractionRadius) * pullStrength;

                        particles[idx + 3] -= nx * force;
                        particles[idx + 4] -= ny * force;
                        
                        const damping = 0.90 - (chargeLevel/MAX_CHARGE) * 0.05;
                        particles[idx + 3] *= damping;
                        particles[idx + 4] *= damping;
                    }

                } else {
                    const interactionRadius = 60;
                    const interactionRSq = interactionRadius * interactionRadius;

                    if (distSq < interactionRSq) { 
                        const dist = Math.sqrt(distSq) || 0.1;
                        const nx = dx / dist;
                        const ny = dy / dist;
                        const pen = interactionRadius - dist;
                        
                        particles[idx] += nx * pen;
                        particles[idx + 1] += ny * pen;

                        const mouseSpeed = Math.sqrt(mouseVx * mouseVx + mouseVy * mouseVy);
                        const forceMultiplier = Math.min(mouseSpeed * 0.3, 20);
                        
                        particles[idx + 3] += nx * forceMultiplier;
                        particles[idx + 4] += ny * forceMultiplier;
                        particles[idx + 3] += mouseVx * 0.2;
                        particles[idx + 4] += mouseVy * 0.2;
                    }
                }
            }

            // Collision with Rocks
            if (pType === TYPE_WATER) {
                const col = (particles[idx] / CELL_SIZE) | 0;
                const row = (particles[idx + 1] / CELL_SIZE) | 0;
                
                if (col >= 0 && col < gridCols && row >= 0 && row < gridRows) {
                    const spheres = collisionGrid[row * gridCols + col];
                    if (spheres) {
                        for (let j = 0; j < spheres.length; j++) {
                            const s = spheres[j];
                            resolveSphereCollision(idx, s.x, s.y, s.z, s.r, s.rSq, true);
                        }
                    }
                }
            }

            if (pType === TYPE_WATER) {
                particles[idx + 3] *= friction;
                particles[idx + 4] *= friction;
                particles[idx + 5] *= friction;
            }

            particles[idx] += particles[idx + 3];
            particles[idx + 1] += particles[idx + 4];
            // Flattened: No Z pos update
            // particles[idx + 2] += particles[idx + 5];

            // WRAP AROUND SCREEN LOGIC (Infinite Space)
            const margin = 50;
            if (particles[idx] < -margin) particles[idx] = w + margin;
            if (particles[idx] > w + margin) particles[idx] = -margin;
            if (particles[idx + 1] < -margin) particles[idx + 1] = h + margin;
            if (particles[idx + 1] > h + margin) particles[idx + 1] = -margin;

            // Render - FLATTENED
            // Scale factor forced to 1.0
            const scaleFactor = 1.0;

            const px = (particles[idx] - cx) * scaleFactor + cx;
            const py = (particles[idx + 1] - cy) * scaleFactor + cy;
            
            const speed = Math.abs(particles[idx + 4]) + Math.abs(particles[idx+3]); 
            
            let size = 2.0; // Base size for 2D
            let alpha = 0.6;

            if (pType === TYPE_FISH) {
                const life = particles[idx + 6];
                alpha = life * 0.8;
                size *= 1.8; 
                const hue = particles[idx + 7];
                ctx.fillStyle = `hsla(${hue}, 90%, 70%, ${alpha})`;
            } else if (pType === TYPE_ROCK) {
                const life = particles[idx + 6];
                alpha = life;
                size *= 1.5;
                // Use the stored hue for rock debris too
                const hue = particles[idx + 7];
                ctx.fillStyle = `hsla(${hue}, 50%, 60%, ${alpha})`; // Lighter for crystal shards
            } else {
                // Water particles
                if (speed > 10) alpha = 0.4; 
                else if (speed < 1) alpha = 0.6; // Make idle particles visible
                // Removed Z depth dimming
                
                let colorStr;
                if (chargeLevel > 0) {
                    const t = Math.min(chargeLevel / (MAX_CHARGE * 0.8), 1);
                    const r = 60 + t * 195;   
                    const g = 200 - t * 150;  
                    const b = 255;            
                    colorStr = `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(2)})`;
                } else {
                    // Color based on flow angle (stored in hue index 7)
                    const hue = particles[idx + 7];
                    // Adjust lightness by speed
                    const light = 40 + Math.min(speed * 5, 40); 
                    colorStr = `hsla(${hue}, 80%, ${light}%, ${alpha.toFixed(2)})`;
                }
                ctx.fillStyle = colorStr;
            }
            
            ctx.fillRect(px, py, size, size);
        }

        // Process deaths
        let fishDied = false;
        jellyfish.forEach(j => {
            if (j.dead) {
                explodeJellyIntoParticles(j);
                fishDied = true;
            }
        });
        if (fishDied) {
            jellyfish = jellyfish.filter(j => !j.dead);
            if (jellyfish.length === 0 && gameState === 'playing') {
                gameState = 'won';
                soundSystem.playWin();
            }
        }

        triggerExplosion = false;
        ctx.globalCompositeOperation = 'source-over';

        animationFrameId = requestAnimationFrame(draw);
    };

    const resize = () => {
        w = canvas.width = window.innerWidth;
        h = canvas.height = window.innerHeight;
        cx = w / 2;
        cy = h / 2;
    };

    window.addEventListener('resize', resize);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);

    canvas.addEventListener('touchmove', handleTouchMove);
    canvas.addEventListener('touchstart', handleTouchStart);
    canvas.addEventListener('touchend', handleTouchEnd);
    
    resize();
    initRocks();
    initJellyfish();
    initParticles(); 
    draw();

    return () => {
        window.removeEventListener('resize', resize);
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mousedown', handleMouseDown);
        window.removeEventListener('mouseup', handleMouseUp);

        canvas.removeEventListener('touchmove', handleTouchMove);
        canvas.removeEventListener('touchstart', handleTouchStart);
        canvas.removeEventListener('touchend', handleTouchEnd);
        cancelAnimationFrame(animationFrameId);
        
        // Cleanup audio
        if (soundSystemRef.current.ctx) {
            soundSystemRef.current.ctx.close();
        }
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full z-0" />;
};

export default FluidSimulation;