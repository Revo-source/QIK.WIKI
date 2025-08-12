"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Navigation, AlertTriangle, Wifi, WifiOff, Video, VideoOff, Download, Camera } from "lucide-react"

interface SpeedData {
  speed: number
  accuracy: number
  heading: number | null
  timestamp: number
}

interface Position {
  latitude: number
  longitude: number
  timestamp: number
}

export default function GPSSpeedometer() {
  const [speed, setSpeed] = useState(0)
  const [maxSpeed, setMaxSpeed] = useState(0)
  const [isTracking, setIsTracking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [accuracy, setAccuracy] = useState<number | null>(null)
  const [heading, setHeading] = useState<number | null>(null)
  const [unit, setUnit] = useState<"mph" | "kmh">("mph")
  const [isConnected, setIsConnected] = useState(false)

  const [isRecording, setIsRecording] = useState(false)
  const [isCameraActive, setIsCameraActive] = useState(false)
  const [recordedChunks, setRecordedChunks] = useState<Blob[]>([])
  const [cameraError, setCameraError] = useState<string | null>(null)

  const watchIdRef = useRef<number | null>(null)
  const lastPositionRef = useRef<Position | null>(null)
  const speedHistoryRef = useRef<number[]>([])

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const calculateSpeed = (pos1: Position, pos2: Position): number => {
    const R = 6371e3 // Earth's radius in meters
    const φ1 = (pos1.latitude * Math.PI) / 180
    const φ2 = (pos2.latitude * Math.PI) / 180
    const Δφ = ((pos2.latitude - pos1.latitude) * Math.PI) / 180
    const Δλ = ((pos2.longitude - pos1.longitude) * Math.PI) / 180

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

    const distance = R * c // Distance in meters
    const timeDiff = (pos2.timestamp - pos1.timestamp) / 1000 // Time in seconds

    if (timeDiff === 0) return 0

    const speedMps = distance / timeDiff // Speed in m/s
    return speedMps * 2.237 // Convert to mph
  }

  const smoothSpeed = (newSpeed: number): number => {
    speedHistoryRef.current.push(newSpeed)
    if (speedHistoryRef.current.length > 5) {
      speedHistoryRef.current.shift()
    }

    // Calculate weighted average (more recent speeds have higher weight)
    let weightedSum = 0
    let totalWeight = 0

    speedHistoryRef.current.forEach((speed, index) => {
      const weight = index + 1
      weightedSum += speed * weight
      totalWeight += weight
    })

    return weightedSum / totalWeight
  }

  const startCamera = async () => {
    try {
      setCameraError(null)
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment", // Use back camera
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: true,
      })

      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }
      setIsCameraActive(true)
    } catch (err) {
      setCameraError("Camera access denied or not available")
      console.error("Camera error:", err)
    }
  }

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    setIsCameraActive(false)
    if (isRecording) {
      stopRecording()
    }
  }

  const startRecording = () => {
    if (!streamRef.current || !canvasRef.current) return

    const canvas = canvasRef.current
    const canvasStream = canvas.captureStream(30) // 30 FPS

    // Combine video and canvas streams
    const combinedStream = new MediaStream([...canvasStream.getVideoTracks(), ...streamRef.current.getAudioTracks()])

    const mediaRecorder = new MediaRecorder(combinedStream, {
      mimeType: "video/webm;codecs=vp9",
    })

    const chunks: Blob[] = []
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data)
      }
    }

    mediaRecorder.onstop = () => {
      setRecordedChunks(chunks)
    }

    mediaRecorderRef.current = mediaRecorder
    mediaRecorder.start()
    setIsRecording(true)
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
    }
  }

  const downloadVideo = () => {
    if (recordedChunks.length === 0) return

    const blob = new Blob(recordedChunks, { type: "video/webm" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `speedometer-recording-${new Date().toISOString().slice(0, 19)}.webm`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    setRecordedChunks([])
  }

  const drawSpeedometerOverlay = () => {
    if (!canvasRef.current || !videoRef.current) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext("2d")
    const video = videoRef.current

    if (!ctx) return

    // Set canvas size to match video
    canvas.width = video.videoWidth || 1920
    canvas.height = video.videoHeight || 1080

    // Draw video frame
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

    // Draw speedometer overlay in top-right corner
    const overlaySize = Math.min(canvas.width, canvas.height) * 0.25
    const overlayX = canvas.width - overlaySize - 20
    const overlayY = 20

    // Semi-transparent background
    ctx.fillStyle = "rgba(0, 0, 0, 0.7)"
    ctx.fillRect(overlayX - 10, overlayY - 10, overlaySize + 20, overlaySize + 20)

    // Draw speedometer circle
    const centerX = overlayX + overlaySize / 2
    const centerY = overlayY + overlaySize / 2
    const radius = overlaySize / 2 - 20

    // Outer circle
    ctx.strokeStyle = "#8b5cf6"
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI)
    ctx.stroke()

    // Speed arc
    const displaySpeed = unit === "mph" ? speed : speed * 1.609344
    const speedPercentage = Math.min((displaySpeed / 200) * 100, 100)
    const arcAngle = (speedPercentage / 100) * 2 * Math.PI

    ctx.strokeStyle = "#ec4899"
    ctx.lineWidth = 6
    ctx.beginPath()
    ctx.arc(centerX, centerY, radius - 10, -Math.PI / 2, -Math.PI / 2 + arcAngle)
    ctx.stroke()

    // Speed text
    ctx.fillStyle = "white"
    ctx.font = `bold ${overlaySize * 0.15}px monospace`
    ctx.textAlign = "center"
    ctx.fillText(displaySpeed.toFixed(1), centerX, centerY - 10)

    ctx.font = `${overlaySize * 0.08}px sans-serif`
    ctx.fillText(unit.toUpperCase(), centerX, centerY + 20)

    // GPS status
    ctx.font = `${overlaySize * 0.06}px sans-serif`
    ctx.fillStyle = isConnected ? "#10b981" : "#ef4444"
    ctx.fillText(isConnected ? "GPS Connected" : "GPS Disconnected", centerX, centerY + 40)
  }

  useEffect(() => {
    let animationId: number

    const animate = () => {
      if (isCameraActive) {
        drawSpeedometerOverlay()
      }
      animationId = requestAnimationFrame(animate)
    }

    if (isCameraActive) {
      animate()
    }

    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId)
      }
    }
  }, [isCameraActive, speed, unit, isConnected])

  const startTracking = () => {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported by this browser")
      return
    }

    setError(null)
    setIsTracking(true)
    lastPositionRef.current = null
    speedHistoryRef.current = []

    const options: PositionOptions = {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 1000,
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        setIsConnected(true)
        setAccuracy(position.coords.accuracy)

        if (position.coords.heading !== null) {
          setHeading(position.coords.heading)
        }

        const currentPosition: Position = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          timestamp: position.timestamp,
        }

        let currentSpeed = 0

        // Use GPS speed if available and accurate
        if (position.coords.speed !== null && position.coords.speed >= 0) {
          currentSpeed = position.coords.speed * 2.237 // Convert m/s to mph
        } else if (lastPositionRef.current) {
          // Calculate speed from position changes
          currentSpeed = calculateSpeed(lastPositionRef.current, currentPosition)
        }

        // Apply smoothing
        const smoothedSpeed = smoothSpeed(Math.max(0, currentSpeed))

        setSpeed(smoothedSpeed)
        setMaxSpeed((prev) => Math.max(prev, smoothedSpeed))

        lastPositionRef.current = currentPosition
      },
      (error) => {
        setIsConnected(false)
        switch (error.code) {
          case error.PERMISSION_DENIED:
            setError("Location access denied. Please enable location permissions.")
            break
          case error.POSITION_UNAVAILABLE:
            setError("Location information unavailable.")
            break
          case error.TIMEOUT:
            setError("Location request timed out.")
            break
          default:
            setError("An unknown error occurred.")
            break
        }
      },
      options,
    )
  }

  const stopTracking = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
    setIsTracking(false)
    setIsConnected(false)
    setSpeed(0)
  }

  const resetMaxSpeed = () => {
    setMaxSpeed(0)
  }

  const toggleUnit = () => {
    setUnit((prev) => (prev === "mph" ? "kmh" : "mph"))
  }

  const displaySpeed = unit === "mph" ? speed : speed * 1.609344
  const displayMaxSpeed = unit === "mph" ? maxSpeed : maxSpeed * 1.609344
  const maxDisplaySpeed = 200
  const speedPercentage = Math.min((displaySpeed / maxDisplaySpeed) * 100, 100)

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
      }
    }
  }, [])

  if (isCameraActive) {
    return (
      <div className="fixed inset-0 bg-black">
        <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
        <canvas ref={canvasRef} className="hidden" />

        {/* Recording Controls Overlay */}
        <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 flex gap-4">
          {!isRecording ? (
            <Button
              onClick={startRecording}
              className="bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-full"
              disabled={!isTracking}
            >
              <Video className="w-5 h-5 mr-2" />
              Start Recording
            </Button>
          ) : (
            <Button
              onClick={stopRecording}
              className="bg-red-800 hover:bg-red-900 text-white px-6 py-3 rounded-full animate-pulse"
            >
              <VideoOff className="w-5 h-5 mr-2" />
              Stop Recording
            </Button>
          )}

          {recordedChunks.length > 0 && (
            <Button
              onClick={downloadVideo}
              className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-full"
            >
              <Download className="w-5 h-5 mr-2" />
              Download
            </Button>
          )}

          <Button
            onClick={stopCamera}
            variant="outline"
            className="px-6 py-3 rounded-full bg-black/50 border-white/30 text-white"
          >
            Exit Camera
          </Button>
        </div>

        {/* Status Overlay */}
        <div className="absolute top-6 left-6 space-y-2">
          <Badge variant={isConnected ? "default" : "destructive"} className="flex items-center gap-2">
            {isConnected ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
            {isConnected ? "GPS Connected" : "GPS Disconnected"}
          </Badge>

          {isRecording && (
            <Badge className="bg-red-600 text-white animate-pulse">
              <div className="w-2 h-2 bg-white rounded-full mr-2"></div>
              Recording
            </Badge>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Status Bar */}
        <div className="flex justify-between items-center">
          <Badge variant={isConnected ? "default" : "destructive"} className="flex items-center gap-2">
            {isConnected ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
            {isConnected ? "GPS Connected" : "GPS Disconnected"}
          </Badge>

          {accuracy && (
            <Badge variant="outline" className="text-xs">
              ±{Math.round(accuracy)}m
            </Badge>
          )}
        </div>

        {/* Main Speedometer */}
        <Card className="relative p-8 bg-gradient-to-br from-slate-800/50 to-purple-800/30 border-purple-500/30 backdrop-blur-sm">
          <div className="relative w-80 h-80 mx-auto">
            {/* Outer Ring */}
            <div className="absolute inset-0 rounded-full border-4 border-purple-500/30">
              {/* Speed Markers */}
              {Array.from({ length: 21 }, (_, i) => {
                const angle = i * 18 - 90 // 0-360 degrees, starting from top
                const isMainMark = i % 5 === 0
                const speed = i * 10

                return (
                  <div
                    key={i}
                    className="absolute w-1 bg-purple-300"
                    style={{
                      height: isMainMark ? "20px" : "10px",
                      left: "50%",
                      top: isMainMark ? "10px" : "15px",
                      transformOrigin: "50% 140px",
                      transform: `translateX(-50%) rotate(${angle}deg)`,
                    }}
                  >
                    {isMainMark && (
                      <span
                        className="absolute text-xs text-purple-300 font-mono"
                        style={{
                          transform: `rotate(-${angle}deg) translateY(-25px)`,
                          left: "50%",
                          marginLeft: "-8px",
                        }}
                      >
                        {speed}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Speed Arc */}
            <div className="absolute inset-4 rounded-full">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(168, 85, 247, 0.2)" strokeWidth="8" />
                <circle
                  cx="50"
                  cy="50"
                  r="45"
                  fill="none"
                  stroke="url(#speedGradient)"
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={`${speedPercentage * 2.827} 282.7`}
                  className="transition-all duration-300 ease-out"
                />
                <defs>
                  <linearGradient id="speedGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#3b82f6" />
                    <stop offset="50%" stopColor="#8b5cf6" />
                    <stop offset="100%" stopColor="#ec4899" />
                  </linearGradient>
                </defs>
              </svg>
            </div>

            {/* Center Display */}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="text-6xl font-bold text-white mb-2 font-mono">{displaySpeed.toFixed(1)}</div>
              <div className="text-xl text-purple-300 font-semibold mb-4">{unit.toUpperCase()}</div>

              {/* Heading Indicator */}
              {heading !== null && (
                <div className="flex items-center gap-2 text-sm text-purple-300">
                  <Navigation className="w-4 h-4" style={{ transform: `rotate(${heading}deg)` }} />
                  <span>{Math.round(heading)}°</span>
                </div>
              )}
            </div>

            {/* Speed Needle */}
            <div
              className="absolute top-1/2 left-1/2 w-1 bg-gradient-to-t from-red-500 to-yellow-400 origin-bottom transition-transform duration-300 ease-out"
              style={{
                height: "120px",
                marginLeft: "-2px",
                marginTop: "-120px",
                transform: `rotate(${(speedPercentage / 100) * 180 - 90}deg)`,
              }}
            >
              <div className="absolute -top-2 -left-1 w-3 h-3 bg-red-500 rounded-full"></div>
            </div>
          </div>
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4">
          <Card className="p-4 bg-slate-800/50 border-slate-700">
            <div className="text-sm text-slate-400">Max Speed</div>
            <div className="text-2xl font-bold text-white">
              {displayMaxSpeed.toFixed(1)} {unit.toUpperCase()}
            </div>
          </Card>

          <Card className="p-4 bg-slate-800/50 border-slate-700">
            <div className="text-sm text-slate-400">Accuracy</div>
            <div className="text-2xl font-bold text-white">{accuracy ? `±${Math.round(accuracy)}m` : "--"}</div>
          </Card>
        </div>

        {/* Controls */}
        <div className="space-y-3">
          <div className="flex gap-3">
            {!isTracking ? (
              <Button onClick={startTracking} className="flex-1 bg-green-600 hover:bg-green-700">
                <Navigation className="w-4 h-4 mr-2" />
                Start Tracking
              </Button>
            ) : (
              <Button onClick={stopTracking} variant="destructive" className="flex-1">
                Stop Tracking
              </Button>
            )}

            <Button onClick={toggleUnit} variant="outline">
              {unit.toUpperCase()}
            </Button>
          </div>

          <div className="flex gap-3">
            {!isCameraActive ? (
              <Button onClick={startCamera} className="flex-1 bg-blue-600 hover:bg-blue-700" disabled={!isTracking}>
                <Camera className="w-4 h-4 mr-2" />
                Start Camera
              </Button>
            ) : (
              <Button onClick={stopCamera} variant="outline" className="flex-1 bg-transparent">
                <VideoOff className="w-4 h-4 mr-2" />
                Stop Camera
              </Button>
            )}
          </div>

          <Button onClick={resetMaxSpeed} variant="outline" className="w-full bg-transparent" disabled={maxSpeed === 0}>
            Reset Max Speed
          </Button>
        </div>

        {/* Error Display */}
        {(error || cameraError) && (
          <Card className="p-4 bg-red-900/20 border-red-500/30">
            <div className="flex items-center gap-2 text-red-400">
              <AlertTriangle className="w-5 h-5" />
              <span className="text-sm">{error || cameraError}</span>
            </div>
          </Card>
        )}

        {/* Instructions */}
        <Card className="p-4 bg-slate-800/30 border-slate-700/50">
          <div className="text-sm text-slate-400 space-y-2">
            <p>
              <strong>Instructions:</strong>
            </p>
            <ul className="list-disc list-inside space-y-1 text-xs">
              <li>Start GPS tracking first for speed data</li>
              <li>Click "Start Camera" to enable video recording</li>
              <li>Allow camera and location access when prompted</li>
              <li>Speedometer overlay appears in camera view</li>
              <li>Record videos with real-time speed display</li>
              <li>Use responsibly and follow traffic laws</li>
            </ul>
          </div>
        </Card>
      </div>
    </div>
  )
}
