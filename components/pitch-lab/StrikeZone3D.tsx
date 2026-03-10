'use client'
import { useMemo } from 'react'
import * as THREE from 'three'
import { Line } from '@react-three/drei'

/** 3D reference geometry: strike zone, home plate, mound, ground, grid lines.
 *  All coordinates in Statcast convention (x=horiz, y=toward mound, z=up).
 *  Parent group handles the z-up → y-up rotation. */
export default function StrikeZone3D() {
  const plateShape = useMemo(() => {
    // Home plate pentagon (17" wide = 17/12 ft)
    const hw = 17 / 12 / 2 // half-width
    const s = new THREE.Shape()
    s.moveTo(-hw, 0)
    s.lineTo(-hw, 0.5)
    s.lineTo(0, 0.85)
    s.lineTo(hw, 0.5)
    s.lineTo(hw, 0)
    s.lineTo(-hw, 0)
    return s
  }, [])

  const PLATE_Y = 17 / 12 // front of plate

  return (
    <group>
      {/* Ground plane */}
      <mesh rotation={[0, 0, 0]} position={[0, 0, -0.01]}>
        <planeGeometry args={[140, 140]} />
        <meshStandardMaterial color="#1a3a1a" />
      </mesh>

      {/* Mound */}
      <mesh position={[0, 60.5, 0.4]}>
        <cylinderGeometry args={[5, 5.5, 0.8, 32]} />
        <meshStandardMaterial color="#8B6914" />
      </mesh>

      {/* Pitching rubber */}
      <mesh position={[0, 60.5, 0.83]}>
        <boxGeometry args={[2, 0.5, 0.08]} />
        <meshStandardMaterial color="#e8e8e8" />
      </mesh>

      {/* Home plate */}
      <mesh position={[0, PLATE_Y - 0.4, 0.01]} rotation={[0, 0, 0]}>
        <shapeGeometry args={[plateShape]} />
        <meshStandardMaterial color="#e8e8e8" side={THREE.DoubleSide} />
      </mesh>

      {/* Strike zone wireframe at plate front */}
      <Line
        points={[
          [-0.708, PLATE_Y, 1.5],
          [0.708, PLATE_Y, 1.5],
          [0.708, PLATE_Y, 3.5],
          [-0.708, PLATE_Y, 3.5],
          [-0.708, PLATE_Y, 1.5],
        ]}
        color="#ffffff"
        lineWidth={1.5}
        transparent
        opacity={0.4}
      />

      {/* Distance grid lines every 10ft from plate to mound */}
      {[10, 20, 30, 40, 50, 60].map(d => (
        <Line
          key={d}
          points={[[-3, d, 0.02], [3, d, 0.02]]}
          color="#444444"
          lineWidth={0.5}
          transparent
          opacity={0.3}
        />
      ))}

      {/* Batter's box outlines */}
      {[-1, 1].map(side => (
        <Line
          key={side}
          points={[
            [side * 1.5, PLATE_Y - 1, 0.02],
            [side * 1.5, PLATE_Y + 3, 0.02],
            [side * 3.5, PLATE_Y + 3, 0.02],
            [side * 3.5, PLATE_Y - 1, 0.02],
            [side * 1.5, PLATE_Y - 1, 0.02],
          ]}
          color="#555555"
          lineWidth={0.5}
          transparent
          opacity={0.2}
        />
      ))}
    </group>
  )
}
