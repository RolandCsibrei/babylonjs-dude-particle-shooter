/* eslint-disable @typescript-eslint/no-non-null-assertion */
// Dude Particle Shooter , Roland Csibrei, 2021

import {
  ArcRotateCamera,
  HemisphericLight,
  Vector3,
  Scene,
  SceneLoader,
  Color4,
  ShadowGenerator,
  CubeTexture,
  TransformNode,
  DefaultRenderingPipeline,
  Mesh,
  VertexBuffer,
  Matrix,
  Nullable,
  FloatArray,
  GlowLayer,
  Color3,
  MeshBuilder,
  StandardMaterial,
  Vector2,
  MirrorTexture,
  Plane,
  Texture,
  AbstractMesh,
  Scalar,
  Sound,
  KeyboardEventTypes
} from '@babylonjs/core'
import '@babylonjs/loaders'
import * as GUI from '@babylonjs/gui'

import { moveCameraTo } from 'src/utils/camera'
import { colorGradient, screenToWorld } from 'src/utils/babylonjs'

import { BaseScene } from './BaseScene'

interface Piece {
  disabled: boolean
  position: Vector3
  startPosition: Vector3
  isShot: boolean
  direction: Vector3
  speed: number
  distance: number
  ticks: number
  tickDirection: number
  startRotation: Vector3
  rotation: Vector3
  rotationDirection: Vector3
  ttl: number
  color: Color3
  origColor: Color3
}

interface Neighbor {
  idx: number
  distance: number
}

interface Shot {
  idx: number
  hits: number
  from: Vector3
  to: Vector3
  mesh?: Mesh
}
export class DudeParticleShooterScene extends BaseScene {
  private _shadowGenerator?: ShadowGenerator

  private _cameraRotation = 0
  private _cameraRadiusD = 0

  private _dude?: Mesh
  private _dudeMeshes?: AbstractMesh[]
  private _neighbors?: Neighbor[]

  private _reflectionTexture?: MirrorTexture
  private _reflectionTextureRenderList: Nullable<AbstractMesh[]> = null

  private _timerStarted = false
  private _timer = 20

  private _isGameMode = true

  private _drawEvery = 1
  private _bufferMatrices!: Float32Array
  private _bufferColors!: Float32Array

  private _allDudePieces: Piece[] = []
  private _dudeParts: DudePart[] = []

  private _prefab?: Mesh

  private _dudeZ = -100
  private _dudeY = -100
  private _minDistance = 9999999999

  private _glow?: GlowLayer
  private _shotCounter = 0
  private _hitCounter = 0

  private _laserSound!: Sound
  private _laserBoom!: Sound

  private _shotRadius = 8

  private _music!: Sound

  private _crosshair!: TransformNode
  private _crosshairHasTarget = false
  private _crosshairNearTarget = false
  private _crosshairShotInProgress = false
  private _crosshairEnabled = false

  private _targetingEnabled = true

  private _cameraParent!: TransformNode
  private _closestMesh?: Mesh
  private _tickValue = 1
  private _pickedPosition?: Vector3

  private _shots: Shot[] = []

  private get _arcCamera() {
    return <ArcRotateCamera>this._camera
  }

  constructor(canvas: HTMLCanvasElement, private _shootCallback: (numberOfHits: number, allTargetCount: number) => void) {
    super(canvas)
  }

  public setupRenderLoop() {
    this._scene.defaultCursor = 'none'

    this._playMusic()
    setTimeout(() => {
      this.setCamera0()
      this._shootCallback(-1, this._allDudePieces.length)

      this._crosshairEnabled = true
    }, 2000)

    this._engine.runRenderLoop(() => {
      this._scene.render()
    })
  }

  public gameOver() {
    this._scene.defaultCursor = 'cursor'
    this._crosshairEnabled = false
    this._targetingEnabled = false
    this.setCamera1()
  }

  public analyzeShots() {
    this._visualizeShots()
    this.rewindTime()
  }

  public shakeCamera() {
    this._shakeCamera(1, 0.44)
  }

  public setTimeDelta(timeDelta: number) {
    this._tickValue = timeDelta
    this._allDudePieces.forEach(d => {
      d.tickDirection = timeDelta
      d.disabled = false
    })
  }

  public rewindTime() {
    this._tickValue = -1
    this._allDudePieces.forEach(d => {
      d.tickDirection = -1
      d.disabled = false
    })
  }

  public pauseTime() {
    this._tickValue = 0
    this._allDudePieces.forEach(d => {
      d.tickDirection = 0
    })
  }

  public normalTime() {
    this._tickValue = 1
    this._allDudePieces.forEach(d => {
      d.tickDirection = 1
    })
  }

  private _shakeCamera(duration: number, magnitude: number) {
    let elapsed = 0
    const cameraShaker = () => {
      if (elapsed < duration) {
        const y = (Math.random() * 2 - 1) * magnitude
        const z = (Math.random() * 2 - 1) * magnitude
        if (this._cameraParent) {
          this._cameraParent.position.y = y
          this._cameraParent.position.z = z
        }
        elapsed += this._scene.deltaTime
      } else {
        this._scene.onBeforeRenderObservable.removeCallback(cameraShaker)
        this._cameraParent.position = Vector3.Zero()
      }
    }
    this._scene.onBeforeRenderObservable.add(cameraShaker)
  }

  private _removeVisualizeShots() {
    if (this._reflectionTextureRenderList && this._reflectionTexture) {
      this._reflectionTextureRenderList = this._reflectionTextureRenderList.filter(m => !m.name.startsWith('tube-'))
      this._reflectionTexture.renderList = this._reflectionTextureRenderList
    }

    this._shots.forEach(s => {
      const tube = this._scene.getMeshByName(`tube-${s.idx}`)
      if (tube) {
        if (tube.material) {
          tube.material.dispose()
        }

        tube.dispose()
      }
    })

    this._shots.length = 0
  }

  private _visualizeShots() {
    this._shots = this._shots.sort((a, b) => {
      return a.hits - b.hits
    })

    const shotCount = this._shots.length
    const color1 = new Color3(0, 1, 0)
    const color2 = new Color3(1, 1, 0)
    const color3 = new Color3(1, 0, 0)

    this._shots.forEach((s, idx) => {
      const tube = MeshBuilder.CreateTube(`tube-${s.idx}`, { path: [s.from, s.to], radius: 0.4 })
      const tubeMaterial = new StandardMaterial('tube', this._scene)
      const color = colorGradient(idx / shotCount, color1, color2, color3)
      tubeMaterial.emissiveColor = new Color3(color.r, color.g, color.b)
      tubeMaterial.alpha = 0.3
      tube.material = tubeMaterial
      s.mesh = tube
      this._reflectionTextureRenderList?.push(tube)
    })

    this._drawBadges()
  }

  private _removeBadges() {
    const children = this._gui.getChildren()
    children.forEach(c => {
      c.dispose()
    })
  }

  private _drawBadges() {
    if (!this._gui) return

    this._shots.forEach(s => {
      const rect = new GUI.Rectangle()
      rect.widthInPixels = 90
      rect.heightInPixels = 26
      rect.thickness = 0
      rect.zIndex = 1000
      rect.background = 'black'

      rect.name = `rect-${s.idx}`

      const label = new GUI.TextBlock()
      label.text = '#' + s.idx.toString() + ' ⟿ ' + s.hits.toString()
      label.fontSizeInPixels = 14
      label.color = 'white'
      rect.addControl(label)

      this._gui.addControl(rect)

      if (s.mesh) {
        rect.linkWithMesh(s.mesh)
        rect.linkOffsetYInPixels = -20
        rect.linkOffsetX = 0.1 * s.idx
      }
    })
  }

  private _enableBloom() {
    const pipeline = new DefaultRenderingPipeline('pipeline', true, this._scene, this._scene.cameras)
    pipeline.bloomEnabled = true
    pipeline.bloomThreshold = 0.2
    pipeline.bloomWeight = 0.01
    pipeline.bloomKernel = 4
    pipeline.bloomScale = 0.05
    pipeline.imageProcessingEnabled = false
    pipeline.fxaaEnabled = true
    pipeline.samples = 2
  }

  private _enableGlow() {
    const glow = new GlowLayer('glow', this._scene, {
      mainTextureFixedSize: 1024,
      blurKernelSize: 64
    })
    this._glow = glow

    this._scene.onBeforeRenderObservable.add(() => {
      glow.intensity = 0.6
      if (this._crosshairShotInProgress === true) {
        glow.intensity = 1.2
      }
    })
  }

  private _resetDude() {
    const allDudePieces = this._allDudePieces

    const thinScale = new Vector3(1, 1, 1)
    const rotationVector = new Vector3(0, 0, 0)

    for (let i = 0; i < allDudePieces.length; i++) {
      const thinPosition = new Vector3(0, 0, 0)
      const matrix3 = Matrix.Compose(thinScale, rotationVector.toQuaternion(), thinPosition)
      matrix3.copyToArray(this._bufferMatrices, i * 16)

      const dudePiece = allDudePieces[i]

      // const c = i / allDudePieces.length
      const c = Math.random()

      const r = c
      const g = c
      const b = c

      this._bufferColors[i * 4 + 0] = r
      this._bufferColors[i * 4 + 1] = g
      this._bufferColors[i * 4 + 2] = b
      this._bufferColors[i * 4 + 3] = 1.0

      dudePiece.color.r = r
      dudePiece.color.g = g
      dudePiece.color.b = b

      dudePiece.origColor.r = r
      dudePiece.origColor.g = g
      dudePiece.origColor.b = b

      dudePiece.disabled = false
      dudePiece.isShot = false
      dudePiece.direction = Vector3.Zero()
      dudePiece.distance = 0
      dudePiece.speed = 0
      dudePiece.ticks = 0
      dudePiece.tickDirection = 1
      dudePiece.rotation = Vector3.Zero()
      dudePiece.startPosition = Vector3.Zero()
      dudePiece.startRotation = Vector3.Zero()
      dudePiece.rotationDirection = Vector3.Zero()
      dudePiece.ttl = 100000

      dudePiece.position = dudePiece.startPosition.clone()
      dudePiece.rotation = dudePiece.startRotation.clone()
    }

    this._dudeParts.forEach(dp => {
      dp.calculatePositions()
    })

    if (this._prefab) {
      this._prefab.thinInstanceSetBuffer('matrix', this._bufferMatrices, 16, false)
      this._prefab.thinInstanceSetBuffer('color', this._bufferColors, 4, false)
    }
  }

  private async _createDude() {
    const scene = this._scene

    const loadedMeshes = await this._loadDude()

    const allDudePieces: Piece[] = []
    this._allDudePieces = allDudePieces
    const arcCamera = <ArcRotateCamera>this._camera
    const dudeParts: DudePart[] = []
    this._dudeParts = dudeParts

    //

    const prefabMaterial = new StandardMaterial('prefab', this._scene)
    const prefab = MeshBuilder.CreateBox('prefab', { size: 1 }, scene)
    prefab.isPickable = false
    this._prefab = prefab

    prefabMaterial.roughness = 0
    prefab.material = prefabMaterial

    for (let i = 1; i < loadedMeshes.length - 1; i += 1) {
      const origMesh = loadedMeshes[i]
      const m = origMesh // .clone(origMesh.name + '-clone', null)
      if (m) {
        const s = 1
        m.scaling = new Vector3(s, s, s)
        m.isPickable = true
        m.visibility = 0

        const dudePart = new DudePart(scene, arcCamera, <Mesh>m, allDudePieces)
        dudePart.calculatePositions()

        dudeParts.push(dudePart)
        dudePart.dudePieces?.forEach(dp => {
          allDudePieces.push(dp)
        })
      }
    }

    const bufferMatrices = new Float32Array(16 * allDudePieces.length)
    this._bufferMatrices = bufferMatrices

    const bufferColors = new Float32Array(4 * allDudePieces.length)
    this._bufferColors = bufferColors

    this._resetDude()

    this._scene.beginAnimation(this._scene.skeletons[0], 0, 100, true, 1)

    scene.onPointerDown = evt => {
      if (evt.button === 0 && this._targetingEnabled === true) {
        if (!this._crosshairShotInProgress) {
          if (this._neighbors) {
            if (this._pickedPosition) {
              this._laserSound.play()
              this._crosshairShotInProgress = true

              setTimeout(() => {
                this._shoot()
              }, 500)

              setTimeout(() => {
                this._crosshairShotInProgress = false
              }, 800)
            }
          }
        }
      }
    }

    scene.onBeforeRenderObservable.add(() => {
      const animRatio = this._scene.getAnimationRatio()
      this._dudeZ += 0.42 * animRatio

      const mousePos3d = screenToWorld(scene.pointerX, scene.pointerY, 0.9934, this._engine, this._scene)
      this._crosshair.position = mousePos3d

      if (mousePos3d && this._targetingEnabled === true) {
        this._pickedPosition = mousePos3d
        let minDistance = Number.MAX_VALUE

        const enabledPieces = allDudePieces.filter(p => p.isShot === false)
        enabledPieces.forEach(p => {
          const position = p.position
          const distance = position.subtract(mousePos3d).length()
          if (distance < minDistance) {
            minDistance = distance
          }

          p.color.r = p.origColor.r
          p.color.g = p.origColor.g
          p.color.b = p.origColor.b
        })

        this._minDistance = minDistance

        // markers
        const checkPos1 = mousePos3d.clone()

        const neighbors = this._getNeighbors(checkPos1, allDudePieces, this._shotRadius)
        this._neighbors = neighbors

        for (let idx = 0; idx < this._neighbors.length; idx++) {
          const dudePiece = allDudePieces[this._neighbors[idx].idx]

          const distance = Vector3.Distance(mousePos3d, dudePiece.position)
          if (distance < this._shotRadius) {
            const color = dudePiece.color
            color.r = distance / this._shotRadius
            color.g = 0
            color.b = 0
          }
        }

        this._crosshairHasTarget = this._neighbors.length > 0
        this._crosshairNearTarget = minDistance < 20
      }

      // calculate positions
      dudeParts.forEach(dp => {
        dp.calculatePositions()
      })

      // update thin instances
      const vector3One = Vector3.One()

      for (let j = 0; j < allDudePieces.length; j++) {
        const dudePiece = allDudePieces[j]
        const dudePieceColor = allDudePieces[j].color
        const rotationVector = dudePiece.rotation
        const position = dudePiece.position

        const matrix = Matrix.Compose(vector3One, rotationVector.toQuaternion(), position)

        // if (j % this._drawEvery === 0) {
        matrix.copyToArray(bufferMatrices, (j / this._drawEvery) * 16)
        bufferColors[j * 4 + 0] = dudePieceColor.r
        bufferColors[j * 4 + 1] = dudePieceColor.g
        bufferColors[j * 4 + 2] = dudePieceColor.b
        bufferColors[j * 4 + 3] = 1.0
        // }
      }

      prefab.thinInstanceBufferUpdated('matrix')
      prefab.thinInstanceBufferUpdated('color')
    })
  }

  private _shoot() {
    this._shotCounter += 1
    if (!this._neighbors) {
      return
    }
    if (!this._pickedPosition) {
      return
    }

    const cameraFront = this._arcCamera.getFrontPosition(1)
    const directionFromCamera = this._pickedPosition.subtract(cameraFront)
    const normalizedDirection = directionFromCamera.normalize()
    const distance = directionFromCamera.length()

    const neighbors = this._neighbors.filter(n => n.distance < this._shotRadius * 0.8)
    const neighborsOuter = this._neighbors.filter(n => n.distance > this._shotRadius * 0.8)
    const numberOfTargets = neighbors.length

    const color1 = Color3.Red()
    const color2 = Color3.Red()
    const color3 = Color3.Yellow()

    const allDudePieces = this._allDudePieces
    neighborsOuter.forEach(n => {
      const dudePiece = allDudePieces[n.idx]
      const c = n.distance / this._shotRadius
      const color = colorGradient(c * c * c * c, color1, color2, color3)
      dudePiece.origColor.r = color.r
      dudePiece.origColor.g = color.g
      dudePiece.origColor.b = color.b
    })

    if (numberOfTargets > 0) {
      this._hitCounter += 1

      this._shots.push({
        idx: this._hitCounter,
        hits: numberOfTargets,
        from: cameraFront.clone(),
        to: this._pickedPosition
      })

      if (this._hitCounter > 0 && this._isGameMode) {
        this._cameraRotation = -1
      } else {
        this._cameraRotation = 0
      }

      this._laserBoom.play()

      this._shootCallback(numberOfTargets, this._allDudePieces.length)

      const speed = distance * 4
      neighbors.forEach(n => {
        const idx = n.idx
        const dudePiece = allDudePieces[idx]

        dudePiece.isShot = true
        const direction = normalizedDirection.clone() // .scale(-1)

        const random = DudeParticleShooterScene._getRandomInRadius(1)

        direction.x = direction.x + random.x
        direction.y = direction.y + random.y
        direction.z = direction.z + (Math.random() * 0.4 - 0.2)

        dudePiece.startPosition.x = dudePiece.position.x
        dudePiece.startPosition.y = dudePiece.position.y
        dudePiece.startPosition.z = dudePiece.position.z

        dudePiece.startRotation.x = Math.random() * Math.PI
        dudePiece.startRotation.y = Math.random() * Math.PI
        dudePiece.startRotation.z = Math.random() * Math.PI

        dudePiece.direction.x = direction.x
        dudePiece.direction.y = direction.y
        dudePiece.direction.z = direction.z

        dudePiece.rotationDirection.x = direction.x
        dudePiece.rotationDirection.y = direction.y
        dudePiece.rotationDirection.z = direction.z

        const c = Math.random()

        dudePiece.color.r = c
        dudePiece.color.g = c
        dudePiece.color.b = c

        dudePiece.ttl = 12000

        dudePiece.speed = speed
      })
    }
  }

  private _createCrosshair() {
    const material = new StandardMaterial('crosshair', this._scene)
    material.emissiveColor = new Color3(1, 1, 0)
    material.disableLighting = true

    this._crosshair = new TransformNode('crosshair', this._scene)
    const crosshairPiece1 = MeshBuilder.CreateBox('crosshairPiece1', { width: 200, height: 4, depth: 4 }, this._scene)
    crosshairPiece1.material = material

    const crosshairPiece2 = crosshairPiece1.createInstance('crosshairPiece2')
    const crosshairPiece3 = crosshairPiece1.createInstance('crosshairPiece3')
    const crosshairPiece4 = crosshairPiece1.createInstance('crosshairPiece4')

    crosshairPiece1.parent = this._crosshair
    crosshairPiece2.parent = this._crosshair
    crosshairPiece3.parent = this._crosshair
    crosshairPiece4.parent = this._crosshair

    crosshairPiece1.lookAt(Vector3.ZeroReadOnly)
    crosshairPiece2.lookAt(Vector3.ZeroReadOnly)
    crosshairPiece3.lookAt(Vector3.ZeroReadOnly)
    crosshairPiece4.lookAt(Vector3.ZeroReadOnly)

    const colorPeace = Color3.Green()
    material.emissiveColor = colorPeace

    let alpha = 0
    this._scene.onBeforeRenderObservable.add(() => {
      this._crosshair.setEnabled(this._crosshairEnabled)
      this._crosshair.lookAt(this._arcCamera.getFrontPosition(1))

      const radius = 2 + this._minDistance
      let speed = 0.04 - (0.02 + Scalar.RangeToPercent(radius, 2, 170) * 0.02)
      let r = 0.6 - Scalar.RangeToPercent(radius, 2, 170)
      let g = 1 // Scalar.RangeToPercent(radius, 2, 170)
      const b = 0

      if (this._crosshairHasTarget) {
        r = 1
        g = 0
      }
      material.emissiveColor.r = r < 0 ? 0 : r
      material.emissiveColor.g = g
      material.emissiveColor.b = b

      if (this._crosshairHasTarget) {
        speed = 0.12
        if (this._crosshairShotInProgress) {
          speed = 0.5
        }
      }

      alpha += speed * this._scene.getAnimationRatio()
      this._crosshair.rotation.z = alpha

      const s = Scalar.RangeToPercent(radius, 2, 170) + 0.2
      const scale = new Vector3(s, s, s)
      crosshairPiece1.scaling = scale
      crosshairPiece2.scaling = scale
      crosshairPiece3.scaling = scale
      crosshairPiece4.scaling = scale

      crosshairPiece1.position.x = -radius
      crosshairPiece2.position.x = radius
      crosshairPiece3.position.y = -radius
      crosshairPiece4.position.y = radius
    })
  }

  private _createGround() {
    const ground = MeshBuilder.CreateGround('ground', { width: 100000, height: 100000 }, this._scene)

    this._scene.onBeforeRenderObservable.add(() => {
      ground.position = new Vector3(0, -1, this._dudeZ)
    })

    ground.alphaIndex = 0

    const mirrorMaterial = new StandardMaterial('mirror', this._scene)
    const groundTexture = new Texture('textures/HexagonGrid-inverted.png', this._scene)
    mirrorMaterial.emissiveTexture = groundTexture
    groundTexture.uScale = 800
    groundTexture.vScale = 800
    groundTexture.level = 0.6

    ground.computeWorldMatrix(true)
    const groundWorldMatrix = ground.getWorldMatrix()

    const groundVertexData = ground.getVerticesData('normal')
    mirrorMaterial.emissiveColor = new Color3(0, 0, 0.03)
    mirrorMaterial.backFaceCulling = false

    const reflectionTexture = new MirrorTexture('mirror', 1024, this._scene, true)
    this._reflectionTexture = reflectionTexture
    const reflectionTextureRenderList = reflectionTexture.renderList ?? []
    this._reflectionTextureRenderList = reflectionTextureRenderList
    if (groundVertexData) {
      const groundNormal = Vector3.TransformNormal(new Vector3(groundVertexData[0], groundVertexData[1], groundVertexData[2]), groundWorldMatrix)

      const reflector = Plane.FromPositionAndNormal(ground.position, groundNormal.scale(-1))
      mirrorMaterial.reflectionTexture = reflectionTexture
      reflectionTexture.adaptiveBlurKernel = 16
      reflectionTexture.mirrorPlane = reflector

      if (this._prefab) {
        reflectionTextureRenderList.push(this._prefab)
      }

      mirrorMaterial.reflectionTexture.level = 1
      mirrorMaterial.disableLighting = true
      mirrorMaterial.alpha = 0.12
      ground.material = mirrorMaterial
    }
  }

  private _getNeighbors(position: Vector3, allPositions: Piece[], radius: number) {
    const neighbors = []
    for (let j = 0; j < allPositions.length; j++) {
      const distance = Vector3.Distance(position, allPositions[j].position)
      if (distance !== undefined && distance < radius) {
        neighbors.push({
          idx: j,
          distance
        })
      }
    }
    return neighbors
  }

  private static _getRandomInRadius(radius: number) {
    const angle = Math.random() * 2 * Math.PI
    const r = Math.random() * radius
    const x = r * Math.cos(angle)
    const y = r * Math.sin(angle)
    return new Vector2(x, y)
  }

  private async _createDudeShooterDemo() {
    await this._createDude()
    this._createGround()
    await this._createSkyBox()
    this._createCrosshair()
    await this._createSounds()
    this._setupKeyboard()
  }

  private _setupKeyboard() {
    this._scene.onKeyboardObservable.add(kbInfo => {
      const key = kbInfo.event.key
      switch (kbInfo.type) {
        case KeyboardEventTypes.KEYDOWN:
          if (key === 'a') {
            this._cameraRotation = -1
          }
          if (key === 'd') {
            this._cameraRotation = 1
          }
          if (key === 'w') {
            this._cameraRadiusD = -1
          }
          if (key === 's') {
            this._cameraRadiusD = 1
          }
          break
        case KeyboardEventTypes.KEYUP:
          // if (key === 'a') {
          //   this._cameraRotation = 0
          // }
          // if (key === 'd') {
          //   this._cameraRotation = 0
          // }
          if (key === 'w') {
            this._cameraRadiusD = 0
          }
          if (key === 's') {
            this._cameraRadiusD = 0
          }
          break
      }
    })
  }

  private async _createSkyBox(): Promise<void> {
    return new Promise((resolve, reject) => {
      const skybox = MeshBuilder.CreateBox('skyBox', { size: 10000.0 }, this._scene)
      const skyboxMaterial = new StandardMaterial('skyBox', this._scene)
      skyboxMaterial.backFaceCulling = false
      const files = [
        'textures/space_left.jpg',
        'textures/space_up.jpg',
        'textures/space_front.jpg',
        'textures/space_right.jpg',
        'textures/space_down.jpg',
        'textures/space_back.jpg'
      ]
      const reflectionTexture = CubeTexture.CreateFromImages(files, this._scene)
      // not working
      // const reflectionTexture = new CubeTexture('', this._scene, null, undefined, files, () => {

      reflectionTexture.coordinatesMode = Texture.SKYBOX_MODE
      skyboxMaterial.reflectionTexture = reflectionTexture
      skyboxMaterial.disableLighting = true
      skyboxMaterial.diffuseColor = new Color3(0, 0, 0)
      skyboxMaterial.specularColor = new Color3(0, 0, 0)
      skybox.material = skyboxMaterial
      resolve()
      // })

      setTimeout(() => {
        reject()
      }, 60000)
    })
  }

  private _playMusic() {
    this._music.play()
  }

  private async _createSounds(): Promise<void> {
    return new Promise(resolve => {
      const laser = new Sound('laser', 'audio/dude-boom-1.mp3', this._scene, () => {
        this._laserSound = laser

        const music = new Sound(
          'music',
          'audio/boss_time.mp3',
          this._scene,
          () => {
            this._music = music
            const boom = new Sound('laser', 'audio/dude-boom-2.mp3', this._scene, () => {
              this._laserBoom = boom
              resolve()
            })
          },
          { loop: false, autoplay: false, volume: 0.6 }
        )
      })
    })
  }

  private async _loadDude() {
    const loaded = await SceneLoader.ImportMeshAsync('', 'models/', 'dude.babylon', this._scene)
    this._dudeMeshes = loaded.meshes
    return loaded.meshes
  }

  createCamera() {
    const cameraParent = new TransformNode('cameraParent', this._scene)
    this._cameraParent = cameraParent

    const camera = new ArcRotateCamera('camera', 2, 1, 1199, new Vector3(0, 40, 0), this._scene)
    camera.parent = cameraParent
    camera.attachControl(this._canvas, true)

    camera.lowerBetaLimit = 0.4
    camera.upperBetaLimit = 1.55
    camera.lowerRadiusLimit = 120
    camera.upperRadiusLimit = 1200

    // camera.inertia = 0.8
    // camera.speed = 0.05
    // camera.angularSensibilityX = 2000
    // camera.angularSensibilityY = 2000
    // camera.panningSensibility = 3000
    // camera.pinchDeltaPercentage = 0.2
    // camera.wheelDeltaPercentage = 0.2
    // camera.speed = 0.05

    this._camera = camera

    this._scene.onBeforeRenderObservable.add(() => {
      this._arcCamera.alpha += (this._cameraRotation / 100) * this._scene.getAnimationRatio()
      this._arcCamera.radius += (this._cameraRadiusD / 1) * this._scene.getAnimationRatio()
    })
  }

  createLight() {
    const light = new HemisphericLight('light', new Vector3(-1, 0, -1), this._scene)
    light.intensity = 0.7

    const light2 = new HemisphericLight('light2', new Vector3(1, 0, -1), this._scene)
    light2.intensity = 0.7
  }

  public async initScene() {
    this._scene.clearColor = new Color4(0, 0, 0, 1)
    this.createCamera()
    this.createLight()

    this._enableBloom()
    this._enableGlow()
    await this._createDudeShooterDemo()
  }

  public restart() {
    this._scene.defaultCursor = 'none'

    this._removeVisualizeShots()
    this._resetDude()
    this.setCamera0()
    this._removeBadges()
    this._crosshairEnabled = true
    this._targetingEnabled = true
  }

  public freeShooting() {
    this._scene.defaultCursor = 'none'

    this._isGameMode = false
    this._removeVisualizeShots()
    this._resetDude()
    this.setCamera0()
    this._removeBadges()
    this._crosshairEnabled = true
    this._targetingEnabled = true
    this._cameraRotation = 0
  }

  public setCamera0() {
    const alpha = this._arcCamera.alpha - Math.PI * 1.2
    const beta = 1.63
    const radius = 220
    this._animateCamera(alpha, beta, radius)
  }

  public setCamera1() {
    const alpha = this._arcCamera.alpha - 1
    const beta = 1
    const radius = 353
    this._animateCamera(alpha, beta, radius)
  }

  private _animateCamera(alpha: number, beta: number, radius: number, target?: Vector3) {
    const arcCamera = <ArcRotateCamera>this._camera
    moveCameraTo(arcCamera, null, target, alpha, beta, radius)
  }
}

class DudePart {
  public dudePieces?: Piece[]
  private _positionsData!: Nullable<FloatArray>
  private _matricesIndicesData!: Nullable<FloatArray>
  private _matricesWeightsData!: Nullable<FloatArray>
  private _skeletonMatrices!: Nullable<Float32Array>

  constructor(private _scene: Scene, private _camera: ArcRotateCamera, mesh: Mesh, private _allDudePieces: Piece[]) {
    if (!mesh.skeleton) {
      return
    }

    this._positionsData = mesh.getVerticesData(VertexBuffer.PositionKind)
    if (!this._positionsData) {
      return
    }
    this._matricesIndicesData = mesh.getVerticesData(VertexBuffer.MatricesIndicesKind)
    if (!this._matricesIndicesData) {
      return
    }
    this._matricesWeightsData = mesh.getVerticesData(VertexBuffer.MatricesWeightsKind)
    if (!this._matricesWeightsData) {
      return
    }
    this._skeletonMatrices = mesh.skeleton.getTransformMatrices(mesh)
    if (!this._skeletonMatrices) {
      return
    }

    const dudePieces: Piece[] = []
    for (let i = 0; i < this._positionsData.length; i += 3) {
      dudePieces.push({
        position: new Vector3(0, 0, 0),
        disabled: false,
        isShot: false,
        direction: Vector3.Zero(),
        distance: 0,
        speed: 0,
        ticks: 0,
        tickDirection: 1,
        rotation: Vector3.Zero(),
        startPosition: Vector3.Zero(),
        startRotation: Vector3.Zero(),
        rotationDirection: Vector3.Zero(),
        ttl: 100000,
        color: new Color3(0, 0, 0),
        origColor: new Color3(0, 0, 0)
      })
    }
    this.dudePieces = dudePieces
  }

  public calculatePositions() {
    const tempVector3 = Vector3.Zero()
    const finalMatrix = new Matrix()
    const tempMatrix = new Matrix()
    let matWeightIdx = 0
    let j = 0
    for (let index = 0; index < this._positionsData!.length; index += 3, matWeightIdx += 4, j++) {
      for (let inf = 0; inf < 4; inf++) {
        const weight = this._matricesWeightsData![matWeightIdx + inf]
        if (weight > 0) {
          Matrix.FromFloat32ArrayToRefScaled(this._skeletonMatrices!, Math.floor(this._matricesIndicesData![matWeightIdx + inf] * 16), weight, tempMatrix)
          finalMatrix.addToSelf(tempMatrix)
        }
      }

      Vector3.TransformCoordinatesFromFloatsToRef(
        this._positionsData![index],
        this._positionsData![index + 1],
        this._positionsData![index + 2],
        finalMatrix,
        tempVector3
      )
      finalMatrix.reset()

      if (this.dudePieces) {
        const dudePiece = this.dudePieces[j]
        if (dudePiece.ticks === dudePiece.ttl) {
          dudePiece.disabled = true
        }

        if (dudePiece.isShot === true) {
          if (dudePiece.ticks === 0 && dudePiece.tickDirection === 0) {
            dudePiece.position.x = tempVector3.x
            dudePiece.position.y = tempVector3.y
            dudePiece.position.z = tempVector3.z
          } else {
            dudePiece.ticks += dudePiece.tickDirection
            const ticks = dudePiece.disabled ? dudePiece.ttl : dudePiece.ticks
            dudePiece.position.x = dudePiece.startPosition.x + dudePiece.direction.x * ticks * dudePiece.speed
            dudePiece.position.y = dudePiece.startPosition.y + dudePiece.direction.y * ticks * dudePiece.speed
            dudePiece.position.z = dudePiece.startPosition.z + dudePiece.direction.z * ticks * dudePiece.speed

            // apply gravity
            // dudePiece.position.x = dudePiece.startPosition.x + dudePiece.direction.x * ticks * dudePiece.speed
            // dudePiece.position.y = dudePiece.startPosition.y + dudePiece.direction.y * ticks * dudePiece.speed - (ticks * ticks) / 20
            // dudePiece.position.z = dudePiece.startPosition.z + dudePiece.direction.z * ticks * dudePiece.speed

            dudePiece.rotation.x = dudePiece.startRotation.x + dudePiece.rotationDirection.x * ticks
            dudePiece.rotation.y = dudePiece.startRotation.y + dudePiece.rotationDirection.y * ticks
            dudePiece.rotation.z = dudePiece.startRotation.z + dudePiece.rotationDirection.z * ticks
          }
        } else {
          dudePiece.position.x = tempVector3.x
          dudePiece.position.y = tempVector3.y
          dudePiece.position.z = tempVector3.z
        }

        if (dudePiece.ticks < 0) {
          dudePiece.ticks = 0
          dudePiece.isShot = false

          dudePiece.position.x = tempVector3.x
          dudePiece.position.y = tempVector3.y
          dudePiece.position.z = tempVector3.z
        }
      }
    }
  }
}
