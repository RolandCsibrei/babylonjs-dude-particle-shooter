<template>
  <q-page>
    <transition :enter-active-class="`animated ${yellAnimIn}`" :leave-active-class="`animated ${yellAnimOut}`">
      <div
        v-if="yell !== ''"
        :class="`absolute text-h2 text-bold text-center text-${yellColor} q-mt-xl full-width`"
        :style="`text-shadow: 0px 0px 20px ${yellShadowColor}`"
      >
        {{ yell }}
      </div>
    </transition>

    <transition enter-active-class="animated slideInUp" leave-active-class="animated slideOutDown">
      <q-page-sticky position="bottom" :offset="[0, 16]" v-if="score > 0 && isStarted && timer > 0">
        <div style="width:1000px;height:40px;opacity:0.4">
          <q-linear-progress dark rounded size="20px" :value="timerNormalized" :color="timerColor">
            <div class="absolute-full flex flex-center">
              <q-badge color="black" text-color="white" :label="timerLabel" />
            </div>
          </q-linear-progress>
        </div>
      </q-page-sticky>
    </transition>

    <transition enter-active-class="animated slideInRight" leave-active-class="animated slideOutDown" mode="out-in">
      <q-page-sticky position="right" :offset="[160, 0]" v-if="score > 0 && isStarted">
        <div class="text-h1 text-blue-4 text-bold" style="opacity: 0.8">
          {{ scoreFormatted }}
          <span v-if="isGameOver" class="text-h4 text-blue-8">{{ targetPercentage }} %</span>
        </div>
        <div class="text-h4 text-white text-right" v-if="isGameOver">of {{ allTargetCountFormatted }} destroyed</div>

        <div class="text-h3 text-orange-8 q-mt-xl text-right" v-if="isGameOver">{{ allHits.length }} shots fired</div>
        <div class="text-h5 text-white row" v-if="isGameOver">
          <div class="col-6 text-red-6">Max damage</div>
          <div class="col-6 text-right">{{ mostDamage }}</div>
        </div>
        <div class="text-h5 text-white row" v-if="isGameOver">
          <div class="col-6 text-green-6">Min damage</div>
          <div class="col-6 text-right">{{ leastDamage }}</div>
        </div>
      </q-page-sticky>
    </transition>

    <transition enter-active-class="animated slideInRight" leave-active-class="animated slideOutDown" mode="out-in">
      <q-page-sticky position="bottom-right" :offset="[32, 32]" v-if="!isLoading && !isStarted">
        <div class="text-green text-h6 q-ma-sm" style="line-height:1.2">
          <span class="text-white">Shoot as many targets as you can in 20 seconds!</span><br />
          Middle mouse or keys A and D to rotate<br />Mousewheel or keys S and W to zoom to acquire lock<br />LMB to shoot <br /><span class="text-red"
            >Target must remain locked until destroyed!</span
          >
        </div>
      </q-page-sticky>
    </transition>

    <transition enter-active-class="animated fadeIn" leave-active-class="animated fadeOut">
      <q-page-sticky v-if="!isLoading && isStarted && isGuiUnlocked && !isDrawerOpen" position="top-left" :offset="[16, 16]">
        <q-btn size="xl" color="white" icon="settings" flat @click="isDrawerOpen = true"></q-btn>
      </q-page-sticky>
    </transition>

    <transition enter-active-class="animated fadeIn" leave-active-class="animated fadeOut">
      <q-page-sticky v-if="isGameOver" position="bottom" :offset="[16, 16]">
        <q-btn size="xl" color="green-4" label="Restart game" flat @click="restart"></q-btn>
        <q-btn size="xl" color="blue-4" label="Free shooting" flat @click="freeShooting" class="q-ml-xl animated heartBeat fullscreenbuttton infinite"></q-btn>
      </q-page-sticky>
    </transition>

    <transition enter-active-class="animated fadeIn" leave-active-class="animated fadeOut" mode="out-in">
      <div class="absolute-center z-top text-center row" v-if="!isLoading && !isStarted">
        <q-btn label="Audio is playing? let's start in fullscreen!" size="xl" color="green-6" flat @click="start" class="col-12 fullscreenbuttton infinite" />
        <q-btn
          label="Can't hear anything? Retry audio initialization!"
          size="md"
          color="blue-4"
          no-caps
          flat
          @click="audio"
          class="animated heartBeat fullscreenbuttton infinite col-12"
        />
      </div>
      <div class="absolute-center z-top text-h6 text-white q-pa-md" v-if="isLoading">
        Loading, please wait...
      </div>
    </transition>
    <transition enter-active-class="animated fadeIn" leave-active-class="animated fadeOut" mode="out-in">
      <div class="fixed-bottom-left z-top q-ma-md" v-if="!isLoading && !isStarted && isAudioTested">
        <q-btn label="Run in classic mode" size="md" color="grey-8" flat @click="startClassic" />
      </div>
    </transition>

    <q-drawer v-model="isDrawerOpen" overlay :width="400">
      <div class="row q-pa-md">
        <div class="col-12 row">
          <div class="text-h5 text-green q-mt-xl col-grow">
            Particles time control
          </div>
          <div class="absolute-right q-pa-sm">
            <q-btn size="md" color="white" icon="close" flat round @click="isDrawerOpen = false"></q-btn>
          </div>
          <div class="row items-center col-12">
            <q-icon class="col-shrink" color="green" name="history_toggle_off" size="md"></q-icon>
            <q-slider
              v-model="timeDelta"
              :min="-1"
              :max="1"
              :step="0.1"
              label-always
              label
              markers
              color="green"
              @input="updateTime"
              class="q-mt-md col-grow"
              snap
            />
          </div>
          <div class="q-mt-md">
            <q-btn flat size="md" label="Rew" icon="history" :color="revButtonColor" @click="rewindTime" class="on-right" />
            <q-btn flat size="md" label="Pause" icon="pause_circle" :color="pauseButtonColor" @click="pauseTime" class="on-right" />
            <q-btn flat size="md" label="Play" icon="update" :color="playButtonColor" @click="normalTime" class="on-right" />
          </div>
          <div class="text-center q-my-xl row">
            <div class="col-12">
              <q-btn
                flat
                label="Toggle fullscreen"
                color="white"
                @click="toggleFullScreen"
                :disable="!$q.fullscreen.isCapable"
                :icon="$q.fullscreen.isActive ? 'fullscreen_exit' : 'fullscreen'"
                :class="$q.fullscreen.isActive ? '' : 'animated infinite heartBeat fullscreenbuttton'"
              />
            </div>
            <div class="col-12">
              <q-btn flat label="Open inspector" icon="pest_control" color="orange" @click="showDebug" class="on-right" />
            </div>
          </div>
        </div>
        <q-separator class="col-12" />
        <div class="col-12 fixed-bottom q-pa-md">
          <div class="row items-center">
            <q-img
              src="bjs-logo.png"
              spinner-color="white"
              style="height: 64px; width: 64px"
              :class="`col ${isLoading ? '' : 'animated'} flip bjs-logo bjs-link col-shrink`"
              @click="gotoBabylonSite"
            />
            <div class="text-white col-grow">Powered by BabylonJS & Roland Csibrei, 2021</div>
          </div>
          <div class="text-caption text-grey-7">
            In game music https://www.fesliyanstudios.com <br />
            Intro music https://freemusicarchive.org/music/Siddhartha
          </div>
        </div>
      </div>
    </q-drawer>

    <canvas ref="bjsCanvas" width="1920" height="1080" class="bjs-canvas" />
  </q-page>
</template>

<script lang="ts">
import { Engine } from '@babylonjs/core'
import { computed, defineComponent, onMounted, onUnmounted, Ref, ref } from '@vue/composition-api'
import { DudeParticleShooterScene } from 'src/scenes/DudeParticleShooterScene'

export default defineComponent({
  name: 'PageIndex',
  setup(_, { root }) {
    const $q = root.$q
    const bjsCanvas = ref<HTMLCanvasElement | null>(null)
    const isDrawerOpen = ref(false)
    const isLoading = ref(true)
    const isAudioTested = ref(false)
    const isStarted = ref(false)
    const isGuiUnlocked = ref(true)
    const isTimeForTheShow = ref(false)
    const isRotation = ref(false)
    const timeDelta = ref(1)
    const score = ref(0)
    const scoreDx = ref(0)
    const targetScore = ref(0)
    const maxTimer = 20
    const mostDamage = ref(0)
    const leastDamage = ref(0)
    const targetPercentage = ref(0)
    const allTargetCountLocal = ref(0)
    const timer = ref(maxTimer)
    const yell = ref('')
    const yellAnimIn = ref('')
    const yellAnimOut = ref('')
    const yellColor = ref('white')
    const yellShadowColor = ref('white')

    const allTargetCountFormatted = computed(() => {
      const s = allTargetCountLocal.value.toString()
      if (s.length > 3) {
        return s.substring(0, s.length - 3) + ' ' + s.substring(s.length - 3)
      }
      return s
    })

    const revButtonColor = computed(() => {
      return timeDelta.value < 0 ? 'blue-5' : 'grey-5'
    })

    const playButtonColor = computed(() => {
      return timeDelta.value > 0 ? 'blue-5' : 'grey-5'
    })

    const pauseButtonColor = computed(() => {
      return timeDelta.value === 0 ? 'blue-5' : 'grey-5'
    })

    const allHits: Ref<number[]> = ref([])
    let engine: Engine

    let scene: DudeParticleShooterScene

    const incScore = () => {
      score.value += Math.floor(scoreDx.value)
      if (score.value < targetScore.value) {
        window.requestAnimationFrame(incScore)
      }
    }

    const timerNormalized = computed(() => {
      return timer.value / maxTimer
    })

    const timerLabel = computed(() => {
      return timer.value.toFixed(0) + ' s'
    })

    const timerColor = computed(() => {
      if (timer.value > maxTimer * 0.8) {
        return 'green'
      }
      if (timer.value > maxTimer * 0.4) {
        return 'yellow'
      }
      return 'red'
    })

    const scoreFormatted = computed(() => {
      const s = score.value.toString()
      if (s.length > 3) {
        return s.substring(0, s.length - 3) + ' ' + s.substring(s.length - 3)
      }
      return s
    })

    const isGameOver = ref(false)
    const analyzeShots = () => {
      mostDamage.value = Math.max(...allHits.value)
      leastDamage.value = Math.min(...allHits.value)
      targetPercentage.value = Math.round((score.value / allTargetCountLocal.value) * 10000) / 100
      scene.analyzeShots()
    }

    const gameOver = () => {
      isGameOver.value = true
      scene.gameOver()
    }

    let timerStarted = false
    const shootCallback = (hits: number, allTargetCount: number) => {
      if (hits > -1) {
        allHits.value.push(hits)
        targetScore.value += hits
      }

      allTargetCountLocal.value = allTargetCount
      scoreDx.value = (targetScore.value - score.value) / 30

      if (hits > 0 && !timerStarted) {
        const interval = setInterval(() => {
          timer.value -= 0.1
          if (timer.value <= 0) {
            gameOver()
            timer.value = 0
            if (yell.value === '') {
              clearInterval(interval)
              analyzeShots()
              return
            }
          }
        }, 100)
        timerStarted = true
      }

      const remainingTargetCount = allTargetCount - targetScore.value + hits
      const percentage = hits / remainingTargetCount

      const idx = Math.floor(Math.random() * 3)

      let timeout = 700
      if (hits === -1) {
        yell.value = 'GAME STARTED! Shoot to start the timer!'
        yellColor.value = 'blue'
        yellShadowColor.value = 'blue'
        timeout = 3000
      }

      if (percentage > 0.02) {
        yell.value = ['GOOD!', 'NOT BAD!', 'COOL!'][idx]
        yellColor.value = 'blue-4'
        yellShadowColor.value = 'blue'
      }

      if (percentage > 0.035) {
        yell.value = ['IMPRESSIVE!', 'AMAZING!', 'NICE!'][idx]
        yellColor.value = 'yellow-4'
        yellShadowColor.value = 'yellow'
      }

      if (percentage > 0.065) {
        yell.value = ['YOU ROCK!', 'HIT HIM HARD!', 'THAT HURTS!'][idx]
        yellColor.value = 'purple-4'
        yellShadowColor.value = 'purple'
      }

      if (hits > 3000) {
        yell.value = ['HEADSHOT!', 'DESTROYER!', 'THANOS LIKE!'][idx]
        yellColor.value = 'red-4'
        yellShadowColor.value = 'red'
      }

      const animInIdx = Math.floor(Math.random() * 3)
      yellAnimIn.value = ['lightSpeedInRight', 'bounceInRight', 'slideInUp'][animInIdx]

      const animOutIdx = Math.floor(Math.random() * 4)
      yellAnimOut.value = ['rollOut', 'zoomOutLeft', 'slideOutLeft', 'zoomOutDown'][animOutIdx]

      setTimeout(() => {
        yell.value = ''
        if (isGameOver.value === true) {
          setTimeout(() => {
            yell.value = 'GAME OVER!'
            yellColor.value = 'red-4'
            yellShadowColor.value = 'red'
          }, 1000)
        }
      }, timeout)
      window.requestAnimationFrame(incScore)
    }

    onMounted(async () => {
      if (bjsCanvas?.value) {
        scene = new DudeParticleShooterScene(bjsCanvas.value, shootCallback)
        engine = scene.getEngine()
        await scene.initScene()
        window.addEventListener('resize', onWindowResize)
        isLoading.value = false

        scene.loadIntroMusic(() => {
          scene.playIntroMusic()
        })
      }
    })

    onUnmounted(() => {
      cleanup()
    })

    const cleanup = () => {
      window.removeEventListener('resize', onWindowResize)
    }

    const gotoBabylonSite = () => {
      window.open('https://www.babylonjs.com', '_blank')
    }

    const pauseTime = () => {
      timeDelta.value = 0
      scene.pauseTime()
    }

    const rewindTime = () => {
      timeDelta.value = -0.2
      scene.rewindTime()
    }

    const normalTime = () => {
      timeDelta.value = 1
      scene.normalTime()
    }

    const updateTime = () => {
      scene.setTimeDelta(timeDelta.value)
    }

    const restart = () => {
      scene.restart()
      allHits.value.length = 0
      score.value = 0
      targetScore.value = 0
      timer.value = maxTimer
      timerStarted = false
      isGameOver.value = false
    }

    const freeShooting = () => {
      yell.value = 'Free shooting'
      yellColor.value = 'blue-4'
      yellShadowColor.value = 'blue'
      score.value = 0
      targetScore.value = 0
      isGameOver.value = false
      allHits.value.length = 0

      isDrawerOpen.value = true
      scene.freeShooting()
    }

    const audio = () => {
      scene.playIntroMusic()
      isAudioTested.value = true
    }

    const toggleFullScreen = async () => {
      if ($q.fullscreen.isCapable) {
        await $q.fullscreen.toggle()
      }
    }

    const onWindowResize = () => {
      if (bjsCanvas.value) {
        bjsCanvas.value.width = bjsCanvas.value?.clientWidth
        bjsCanvas.value.height = bjsCanvas.value?.clientHeight
      }
      engine.resize()
    }

    const showDebug = async () => {
      isDrawerOpen.value = false
      await scene?.showDebug()
    }

    const start = async () => {
      if ($q.fullscreen.isCapable) {
        await $q.fullscreen.toggle()
        startClassic()
      }
    }

    const startClassic = () => {
      scene.stopIntroMusic()
      scene.startScene()

      let opacity = 0
      function fade() {
        if (opacity < 1) {
          opacity += 0.015
          if (opacity < 1) {
            window.requestAnimationFrame(fade)
          }
          if (bjsCanvas.value) {
            bjsCanvas.value.style.opacity = opacity.toPrecision(4)
          }
        }
      }

      window.requestAnimationFrame(fade)

      isStarted.value = true
      setTimeout(() => {
        isGuiUnlocked.value = true
      }, 10000)
    }
    return {
      isAudioTested,
      isGuiUnlocked,
      audio,
      start,
      startClassic,
      gotoBabylonSite,
      bjsCanvas,
      toggleFullScreen,
      isStarted,
      showDebug,
      isTimeForTheShow,
      pauseTime,
      normalTime,
      rewindTime,
      scoreFormatted,
      timeDelta,
      updateTime,
      isRotation,
      isLoading,
      score,
      yell,
      yellAnimIn,
      yellAnimOut,
      yellColor,
      yellShadowColor,
      restart,
      isDrawerOpen,
      timer,
      timerNormalized,
      timerLabel,
      timerColor,
      isGameOver,
      freeShooting,
      allHits,
      mostDamage,
      leastDamage,
      allTargetCountLocal,
      allTargetCountFormatted,
      targetPercentage,
      revButtonColor,
      playButtonColor,
      pauseButtonColor
    }
  }
})
</script>

<style lang="sass">
.bjs-canvas
  width: 100%
  height: 100%
  opacity: 0
.bjs-link
  cursor: pointer
.bjs-logo
  --animate-duration: 1.2s
  animation-delay: 10s
.fullscreenbuttton
  --animate-duration: 2s
aside
  background-color: rgba(0,0,0,0.3) !important
</style>
