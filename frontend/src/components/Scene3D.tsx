import {
  Environment,
  Float,
  MeshDistortMaterial,
  MeshTransmissionMaterial,
} from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Suspense, useRef } from 'react'
import * as THREE from 'three'

/**
 * Математическая 3D-сцена — Платоновы тела + тор-кнот.
 * Используется как фон Hero. pointer-events-none, не ловит клики.
 */
export function Scene3D() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden>
      <Canvas
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        camera={{ position: [0, 0, 7], fov: 42 }}
      >
        <Suspense fallback={null}>
          {/* ровный тёплый свет из HDR-окружения */}
          <Environment preset="sunset" background={false} />
          {/* тёмный fog создаёт глубину — фигуры дальше немного тонут */}
          <fog attach="fog" args={['#07070c', 8, 18]} />
          {/* ambient — слабый, чтобы тени читались */}
          <ambientLight intensity={0.25} />
          {/* тёплый "золотой" ключевой свет сверху-справа */}
          <spotLight
            position={[6, 8, 4]}
            angle={0.4}
            penumbra={1}
            intensity={110}
            color="#f4c374"
            castShadow={false}
          />
          {/* холодный fill снизу-слева */}
          <pointLight position={[-6, -3, 2]} intensity={30} color="#6a8b78" />

          <SceneContent />
        </Suspense>
      </Canvas>
    </div>
  )
}

function SceneContent() {
  const { pointer } = useThree()
  const group = useRef<THREE.Group>(null)

  // лёгкая параллакс-ротация всей группы по курсору — камера как бы следит
  useFrame((_, dt) => {
    const g = group.current
    if (!g) return
    const targetX = pointer.y * 0.15
    const targetY = pointer.x * 0.25
    g.rotation.x += (targetX - g.rotation.x) * Math.min(1, dt * 2.4)
    g.rotation.y += (targetY - g.rotation.y) * Math.min(1, dt * 2.4)
  })

  return (
    <group ref={group}>
      {/* Икосаэдр — золотой металл с лёгким искажением */}
      <Float speed={1.1} rotationIntensity={0.6} floatIntensity={1.2} position={[-2.6, 0.6, -0.5]}>
        <mesh>
          <icosahedronGeometry args={[1.15, 1]} />
          <MeshDistortMaterial
            color="#d4a574"
            metalness={0.85}
            roughness={0.18}
            distort={0.22}
            speed={1.1}
            envMapIntensity={1.4}
          />
        </mesh>
      </Float>

      {/* Додекаэдр — стеклянный, с преломлением */}
      <Float speed={0.9} rotationIntensity={0.5} floatIntensity={1.4} position={[2.4, -0.3, 0]}>
        <mesh>
          <dodecahedronGeometry args={[1, 0]} />
          <MeshTransmissionMaterial
            color="#f6f2ea"
            thickness={0.9}
            roughness={0.05}
            transmission={1}
            ior={1.35}
            chromaticAberration={0.06}
            backside
            samples={6}
            resolution={512}
          />
        </mesh>
      </Float>

      {/* Тор-кнот — азуровый, глубже в сцене */}
      <Float speed={0.7} rotationIntensity={1.1} floatIntensity={0.9} position={[0.3, -1.6, -2.4]}>
        <mesh>
          <torusKnotGeometry args={[0.55, 0.17, 180, 24, 2, 3]} />
          <meshPhysicalMaterial
            color="#6a8b78"
            metalness={0.6}
            roughness={0.25}
            clearcoat={1}
            clearcoatRoughness={0.1}
            envMapIntensity={1}
          />
        </mesh>
      </Float>

      {/* Октаэдр — крохотный, глубоко сзади, как «спутник» */}
      <Float speed={1.4} rotationIntensity={0.9} floatIntensity={1.6} position={[1.1, 2.2, -3.2]}>
        <mesh>
          <octahedronGeometry args={[0.45, 0]} />
          <meshStandardMaterial
            color="#e8c38a"
            metalness={1}
            roughness={0.25}
            envMapIntensity={1.4}
          />
        </mesh>
      </Float>
    </group>
  )
}
