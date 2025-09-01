// lib/smartDrawingEngine.ts
import { enhancedSemanticAnalyzer } from './enhancedSemanticAnalysis';
import { supportClassificationEngine } from './supportClassification';
import { hierarchicalArchitectureEngine } from './hierarchicalArchitecture';

export interface DrawingPoint {
  x: number;
  y: number;
  pressure?: number;
  timestamp?: number;
}

export interface DrawingStroke {
  id: string;
  points: DrawingPoint[];
  color: string;
  width: number;
  tool: DrawingTool;
  semanticTag?: string;
  conceptId?: string;
}

export interface DrawingShape {
  id: string;
  type: 'circle' | 'rectangle' | 'arrow' | 'line' | 'text' | 'concept-bubble' | 'process-box';
  bounds: { x: number; y: number; width: number; height: number };
  properties: Record<string, any>;
  semanticContext?: string;
  relatedConcepts?: string[];
}

export interface SmartSuggestion {
  type: 'shape' | 'diagram' | 'annotation' | 'connection';
  description: string;
  confidence: number;
  action: () => void;
  preview?: string;
}

export type DrawingTool = 'pen' | 'highlighter' | 'eraser' | 'shape' | 'text' | 'smart-suggest';

export interface DrawingState {
  strokes: DrawingStroke[];
  shapes: DrawingShape[];
  currentTool: DrawingTool;
  currentColor: string;
  currentWidth: number;
  canvasSize: { width: number; height: number };
  semanticContext?: string;
  mainConcepts?: string[];
}

export class SmartDrawingEngine {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private state: DrawingState;
  private isDrawing = false;
  private currentStroke: DrawingPoint[] = [];
  private gestureBuffer: DrawingPoint[] = [];
  private lastPoint: DrawingPoint | null = null;
  
  // Semantic analysis integration
  private semanticContext: string = '';
  private currentConcepts: string[] = [];
  private suggestions: SmartSuggestion[] = [];

  constructor(canvas: HTMLCanvasElement, initialState?: Partial<DrawingState>) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    
    this.state = {
      strokes: [],
      shapes: [],
      currentTool: 'pen',
      currentColor: '#2563eb',
      currentWidth: 2,
      canvasSize: { width: canvas.width, height: canvas.height },
      ...initialState
    };

    this.setupEventListeners();
  }

  // Public API methods
  public setTool(tool: DrawingTool) {
    this.state.currentTool = tool;
  }

  public setColor(color: string) {
    this.state.currentColor = color;
  }

  public setWidth(width: number) {
    this.state.currentWidth = width;
  }

  public getState(): DrawingState {
    return { ...this.state };
  }

  public getSuggestions(): SmartSuggestion[] {
    return [...this.suggestions];
  }

  public clear() {
    this.state.strokes = [];
    this.state.shapes = [];
    this.redraw();
  }

  public undo() {
    if (this.state.strokes.length > 0) {
      this.state.strokes.pop();
    } else if (this.state.shapes.length > 0) {
      this.state.shapes.pop();
    }
    this.redraw();
  }

  // Initialize semantic context for intelligent suggestions
  async initializeSemanticContext(text: string, concepts: string[] = []) {
    this.semanticContext = text;
    this.currentConcepts = concepts;
    
    try {
      // Analyze text for drawing suggestions
      const semanticAnalysis = await enhancedSemanticAnalyzer.analyzeSentenceSemantics(text);
      const supportAnalysis = await supportClassificationEngine.analyzeSupportingInformation([text], concepts[0] || '', { 
        documentType: 'general',
        domain: 'general',
        complexity: 'moderate',
        userExpertiseLevel: 'intermediate'
      });
      const hierarchyAnalysis = await hierarchicalArchitectureEngine.generateDocumentOutline(text);
      
      // Generate smart suggestions based on analysis
      this.generateSmartSuggestions(semanticAnalysis, supportAnalysis, hierarchyAnalysis);
    } catch (error) {
      console.error('Failed to initialize semantic context:', error);
    }
  }

  private generateSmartSuggestions(semanticAnalysis: any, supportAnalysis: any, hierarchyAnalysis: any) {
    this.suggestions = [];

    // Suggest diagrams based on support types
    if (supportAnalysis.classifications) {
      supportAnalysis.classifications.forEach((element: any) => {
        switch (element.type) {
          case 'EXAMPLE':
            this.suggestions.push({
              type: 'diagram',
              description: 'Create step-by-step example diagram',
              confidence: 0.8,
              action: () => this.createExampleDiagram(element.text)
            });
            break;
          case 'EVIDENCE':
            this.suggestions.push({
              type: 'diagram',
              description: 'Create evidence chart',
              confidence: 0.7,
              action: () => this.createEvidenceChart(element.text)
            });
            break;
          case 'EXPLANATION':
            this.suggestions.push({
              type: 'diagram',
              description: 'Create flow chart explanation',
              confidence: 0.9,
              action: () => this.createFlowChart(element.text)
            });
            break;
        }
      });
    }

    // Suggest concept maps based on hierarchy
    if (hierarchyAnalysis.sections && hierarchyAnalysis.sections.length > 1) {
      this.suggestions.push({
        type: 'diagram',
        description: 'Create concept hierarchy map',
        confidence: 0.85,
        action: () => this.createConceptMap(hierarchyAnalysis.sections)
      });
    }
  }

  private setupEventListeners() {
    if (!this.canvas) return;

    // Mouse events
    this.canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
    this.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
    this.canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
    this.canvas.addEventListener('mouseleave', this.handleMouseUp.bind(this));

    // Touch events for mobile
    this.canvas.addEventListener('touchstart', this.handleTouchStart.bind(this));
    this.canvas.addEventListener('touchmove', this.handleTouchMove.bind(this));
    this.canvas.addEventListener('touchend', this.handleTouchEnd.bind(this));

    // Prevent default touch behaviors
    this.canvas.addEventListener('touchstart', (e) => e.preventDefault());
    this.canvas.addEventListener('touchmove', (e) => e.preventDefault());
  }

  private getPointFromEvent(event: MouseEvent | TouchEvent): DrawingPoint {
    const rect = this.canvas!.getBoundingClientRect();
    let clientX: number, clientY: number;

    if (event instanceof MouseEvent) {
      clientX = event.clientX;
      clientY = event.clientY;
    } else {
      const touch = event.touches[0] || event.changedTouches[0];
      clientX = touch.clientX;
      clientY = touch.clientY;
    }

    return {
      x: (clientX - rect.left) * (this.canvas!.width / rect.width),
      y: (clientY - rect.top) * (this.canvas!.height / rect.height),
      pressure: this.simulatePressure(event),
      timestamp: Date.now()
    };
  }

  private simulatePressure(event: MouseEvent | TouchEvent): number {
    // Simulate pressure based on drawing speed and tool
    if (this.lastPoint && this.currentStroke.length > 1) {
      const currentPoint = this.getPointFromEvent(event);
      const distance = Math.sqrt(
        Math.pow(currentPoint.x - this.lastPoint.x, 2) + 
        Math.pow(currentPoint.y - this.lastPoint.y, 2)
      );
      
      // Slower drawing = more pressure
      const speed = distance / Math.max(1, (currentPoint.timestamp! - this.lastPoint.timestamp!));
      return Math.max(0.3, Math.min(1.0, 1.0 - speed * 0.1));
    }
    return 0.7; // Default pressure
  }

  private handleMouseDown(event: MouseEvent) {
    this.startDrawing(this.getPointFromEvent(event));
  }

  private handleMouseMove(event: MouseEvent) {
    if (this.isDrawing) {
      this.continueDrawing(this.getPointFromEvent(event));
    }
  }

  private handleMouseUp(event: MouseEvent) {
    this.endDrawing();
  }

  private handleTouchStart(event: TouchEvent) {
    this.startDrawing(this.getPointFromEvent(event));
  }

  private handleTouchMove(event: TouchEvent) {
    if (this.isDrawing) {
      this.continueDrawing(this.getPointFromEvent(event));
    }
  }

  private handleTouchEnd(event: TouchEvent) {
    this.endDrawing();
  }

  private startDrawing(point: DrawingPoint) {
    this.isDrawing = true;
    this.currentStroke = [point];
    this.gestureBuffer = [point];
    this.lastPoint = point;
  }

  private continueDrawing(point: DrawingPoint) {
    if (!this.isDrawing || !this.ctx) return;

    this.currentStroke.push(point);
    this.gestureBuffer.push(point);
    
    // Keep gesture buffer manageable
    if (this.gestureBuffer.length > 20) {
      this.gestureBuffer.shift();
    }

    // Draw smooth line using quadratic curves
    this.drawSmoothLine(this.lastPoint!, point);
    this.lastPoint = point;
  }

  private endDrawing() {
    if (!this.isDrawing) return;
    
    this.isDrawing = false;
    
    // Analyze gesture for shape recognition
    const recognizedShape = this.recognizeGesture(this.gestureBuffer);
    
    if (recognizedShape) {
      // Replace freehand stroke with recognized shape
      this.addShape(recognizedShape);
    } else {
      // Add as freehand stroke
      this.addStroke({
        id: this.generateId(),
        points: [...this.currentStroke],
        color: this.state.currentColor,
        width: this.state.currentWidth,
        tool: this.state.currentTool,
        semanticTag: this.getSemanticTag(this.currentStroke)
      });
    }

    this.currentStroke = [];
    this.gestureBuffer = [];
    this.lastPoint = null;
    
    // Generate new suggestions based on current drawing
    this.updateSmartSuggestions();
  }

  private drawSmoothLine(from: DrawingPoint, to: DrawingPoint) {
    if (!this.ctx) return;

    this.ctx.save();
    this.ctx.globalCompositeOperation = this.state.currentTool === 'eraser' ? 'destination-out' : 'source-over';
    this.ctx.strokeStyle = this.state.currentColor;
    this.ctx.lineWidth = this.state.currentWidth * (to.pressure || 0.7);
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';

    this.ctx.beginPath();
    this.ctx.moveTo(from.x, from.y);
    
    // Use quadratic curve for smoothness
    const midX = (from.x + to.x) / 2;
    const midY = (from.y + to.y) / 2;
    this.ctx.quadraticCurveTo(from.x, from.y, midX, midY);
    
    this.ctx.stroke();
    this.ctx.restore();
  }

  private recognizeGesture(points: DrawingPoint[]): DrawingShape | null {
    if (points.length < 5) return null;

    const bounds = this.calculateBounds(points);
    
    // Circle detection
    if (this.isCircularGesture(points)) {
      return {
        id: this.generateId(),
        type: 'circle',
        bounds,
        properties: {
          centerX: bounds.x + bounds.width / 2,
          centerY: bounds.y + bounds.height / 2,
          radius: Math.min(bounds.width, bounds.height) / 2,
          color: this.state.currentColor,
          strokeWidth: this.state.currentWidth
        },
        semanticContext: this.getSemanticContext(points)
      };
    }

    // Rectangle detection
    if (this.isRectangularGesture(points)) {
      return {
        id: this.generateId(),
        type: 'rectangle',
        bounds,
        properties: {
          color: this.state.currentColor,
          strokeWidth: this.state.currentWidth
        },
        semanticContext: this.getSemanticContext(points)
      };
    }

    // Arrow detection
    if (this.isArrowGesture(points)) {
      const start = points[0];
      const end = points[points.length - 1];
      return {
        id: this.generateId(),
        type: 'arrow',
        bounds,
        properties: {
          startX: start.x,
          startY: start.y,
          endX: end.x,
          endY: end.y,
          color: this.state.currentColor,
          strokeWidth: this.state.currentWidth
        },
        semanticContext: this.getSemanticContext(points)
      };
    }

    return null;
  }

  private isCircularGesture(points: DrawingPoint[]): boolean {
    if (points.length < 8) return false;
    
    const bounds = this.calculateBounds(points);
    const center = {
      x: bounds.x + bounds.width / 2,
      y: bounds.y + bounds.height / 2
    };
    
    const avgRadius = bounds.width / 2;
    let radiusVariance = 0;
    
    points.forEach(point => {
      const distance = Math.sqrt(
        Math.pow(point.x - center.x, 2) + Math.pow(point.y - center.y, 2)
      );
      radiusVariance += Math.abs(distance - avgRadius);
    });
    
    const normalizedVariance = radiusVariance / (points.length * avgRadius);
    return normalizedVariance < 0.3;
  }

  private isRectangularGesture(points: DrawingPoint[]): boolean {
    if (points.length < 8) return false;
    
    const bounds = this.calculateBounds(points);
    const corners = [
      { x: bounds.x, y: bounds.y },
      { x: bounds.x + bounds.width, y: bounds.y },
      { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
      { x: bounds.x, y: bounds.y + bounds.height }
    ];
    
    let cornerHits = 0;
    corners.forEach(corner => {
      const nearbyPoints = points.filter(point => 
        Math.sqrt(Math.pow(point.x - corner.x, 2) + Math.pow(point.y - corner.y, 2)) < 20
      );
      if (nearbyPoints.length > 0) cornerHits++;
    });
    
    return cornerHits >= 3;
  }

  private isArrowGesture(points: DrawingPoint[]): boolean {
    if (points.length < 5) return false;
    
    const start = points[0];
    const end = points[points.length - 1];
    const distance = Math.sqrt(
      Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2)
    );
    
    if (distance < 50) return false;
    
    let totalDeviation = 0;
    points.forEach(point => {
      const lineDistance = this.pointToLineDistance(point, start, end);
      totalDeviation += lineDistance;
    });
    
    const avgDeviation = totalDeviation / points.length;
    return avgDeviation < 15;
  }

  private pointToLineDistance(point: DrawingPoint, lineStart: DrawingPoint, lineEnd: DrawingPoint): number {
    const A = lineEnd.y - lineStart.y;
    const B = lineStart.x - lineEnd.x;
    const C = lineEnd.x * lineStart.y - lineStart.x * lineEnd.y;
    
    return Math.abs(A * point.x + B * point.y + C) / Math.sqrt(A * A + B * B);
  }

  private calculateBounds(points: DrawingPoint[]): { x: number; y: number; width: number; height: number } {
    if (points.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
    
    const xs = points.map(p => p.x);
    const ys = points.map(p => p.y);
    
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    
    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY
    };
  }

  private getSemanticTag(points: DrawingPoint[]): string {
    const bounds = this.calculateBounds(points);
    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;
    
    if (centerY < this.state.canvasSize.height * 0.3) {
      return 'title-area';
    } else if (centerY > this.state.canvasSize.height * 0.7) {
      return 'conclusion-area';
    } else if (centerX < this.state.canvasSize.width * 0.3) {
      return 'supporting-info';
    } else if (centerX > this.state.canvasSize.width * 0.7) {
      return 'examples';
    } else {
      return 'main-concept';
    }
  }

  private getSemanticContext(points: DrawingPoint[]): string {
    const tag = this.getSemanticTag(points);
    return `Drawing in ${tag} with ${this.currentConcepts.length} related concepts`;
  }

  private updateSmartSuggestions() {
    const hasShapes = this.state.shapes.length > 0;
    const hasStrokes = this.state.strokes.length > 0;
    
    if (hasShapes && !hasStrokes) {
      this.suggestions.push({
        type: 'annotation',
        description: 'Add labels to your shapes',
        confidence: 0.8,
        action: () => this.setTool('text')
      });
    }
    
    if (this.state.shapes.filter(s => s.type === 'circle').length >= 2) {
      this.suggestions.push({
        type: 'connection',
        description: 'Connect related concepts with arrows',
        confidence: 0.9,
        action: () => this.suggestConnections()
      });
    }
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private addStroke(stroke: DrawingStroke) {
    this.state.strokes.push(stroke);
    this.redraw();
  }

  private addShape(shape: DrawingShape) {
    this.state.shapes.push(shape);
    this.redraw();
  }

  public redraw() {
    if (!this.ctx) return;

    // Clear canvas
    this.ctx.clearRect(0, 0, this.state.canvasSize.width, this.state.canvasSize.height);
    
    // Set white background
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillRect(0, 0, this.state.canvasSize.width, this.state.canvasSize.height);

    // Draw all strokes
    this.state.strokes.forEach(stroke => {
      this.drawStroke(stroke);
    });

    // Draw all shapes
    this.state.shapes.forEach(shape => {
      this.drawShape(shape);
    });
  }

  private drawStroke(stroke: DrawingStroke) {
    if (!this.ctx || stroke.points.length < 2) return;

    this.ctx.save();
    this.ctx.strokeStyle = stroke.color;
    this.ctx.lineWidth = stroke.width;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';

    this.ctx.beginPath();
    this.ctx.moveTo(stroke.points[0].x, stroke.points[0].y);

    for (let i = 1; i < stroke.points.length; i++) {
      const point = stroke.points[i];
      const prevPoint = stroke.points[i - 1];
      
      const midX = (prevPoint.x + point.x) / 2;
      const midY = (prevPoint.y + point.y) / 2;
      
      this.ctx.quadraticCurveTo(prevPoint.x, prevPoint.y, midX, midY);
    }

    this.ctx.stroke();
    this.ctx.restore();
  }

  private drawShape(shape: DrawingShape) {
    if (!this.ctx) return;

    this.ctx.save();
    this.ctx.strokeStyle = shape.properties.color || '#2563eb';
    this.ctx.lineWidth = shape.properties.strokeWidth || 2;

    switch (shape.type) {
      case 'circle':
        this.ctx.beginPath();
        this.ctx.arc(
          shape.properties.centerX,
          shape.properties.centerY,
          shape.properties.radius,
          0,
          2 * Math.PI
        );
        if (shape.properties.fillColor) {
          this.ctx.fillStyle = shape.properties.fillColor;
          this.ctx.fill();
        }
        this.ctx.stroke();
        break;

      case 'rectangle':
        if (shape.properties.fillColor) {
          this.ctx.fillStyle = shape.properties.fillColor;
          this.ctx.fillRect(shape.bounds.x, shape.bounds.y, shape.bounds.width, shape.bounds.height);
        }
        this.ctx.strokeRect(shape.bounds.x, shape.bounds.y, shape.bounds.width, shape.bounds.height);
        break;

      case 'arrow':
        this.drawArrow(
          shape.properties.startX,
          shape.properties.startY,
          shape.properties.endX,
          shape.properties.endY
        );
        break;

      case 'line':
        this.ctx.beginPath();
        this.ctx.moveTo(shape.properties.startX, shape.properties.startY);
        this.ctx.lineTo(shape.properties.endX, shape.properties.endY);
        this.ctx.stroke();
        break;

      case 'text':
        this.ctx.fillStyle = shape.properties.color || '#000000';
        this.ctx.font = `${shape.properties.fontSize || 16}px Arial`;
        this.ctx.fillText(shape.properties.text || '', shape.bounds.x, shape.bounds.y);
        break;

      case 'concept-bubble':
        // Draw circle
        this.ctx.beginPath();
        this.ctx.arc(
          shape.bounds.x + shape.bounds.width / 2,
          shape.bounds.y + shape.bounds.height / 2,
          Math.min(shape.bounds.width, shape.bounds.height) / 2,
          0,
          2 * Math.PI
        );
        if (shape.properties.fillColor) {
          this.ctx.fillStyle = shape.properties.fillColor;
          this.ctx.fill();
        }
        this.ctx.stroke();
        
        // Draw text
        if (shape.properties.text) {
          this.ctx.fillStyle = shape.properties.color || '#000000';
          this.ctx.font = '12px Arial';
          this.ctx.textAlign = 'center';
          this.ctx.fillText(
            shape.properties.text,
            shape.bounds.x + shape.bounds.width / 2,
            shape.bounds.y + shape.bounds.height / 2
          );
        }
        break;

      case 'process-box':
        // Draw rounded rectangle
        this.drawRoundedRect(shape.bounds.x, shape.bounds.y, shape.bounds.width, shape.bounds.height, 8);
        if (shape.properties.fillColor) {
          this.ctx.fillStyle = shape.properties.fillColor;
          this.ctx.fill();
        }
        this.ctx.stroke();
        
        // Draw text
        if (shape.properties.text) {
          this.ctx.fillStyle = shape.properties.color || '#000000';
          this.ctx.font = '12px Arial';
          this.ctx.textAlign = 'center';
          this.ctx.fillText(
            shape.properties.text,
            shape.bounds.x + shape.bounds.width / 2,
            shape.bounds.y + shape.bounds.height / 2
          );
        }
        break;
    }

    this.ctx.restore();
  }

  private drawArrow(x1: number, y1: number, x2: number, y2: number) {
    if (!this.ctx) return;

    const headLength = 15;
    const angle = Math.atan2(y2 - y1, x2 - x1);

    // Draw line
    this.ctx.beginPath();
    this.ctx.moveTo(x1, y1);
    this.ctx.lineTo(x2, y2);
    this.ctx.stroke();

    // Draw arrowhead
    this.ctx.beginPath();
    this.ctx.moveTo(x2, y2);
    this.ctx.lineTo(
      x2 - headLength * Math.cos(angle - Math.PI / 6),
      y2 - headLength * Math.sin(angle - Math.PI / 6)
    );
    this.ctx.moveTo(x2, y2);
    this.ctx.lineTo(
      x2 - headLength * Math.cos(angle + Math.PI / 6),
      y2 - headLength * Math.sin(angle + Math.PI / 6)
    );
    this.ctx.stroke();
  }

  private drawRoundedRect(x: number, y: number, width: number, height: number, radius: number) {
    if (!this.ctx) return;

    this.ctx.beginPath();
    this.ctx.moveTo(x + radius, y);
    this.ctx.lineTo(x + width - radius, y);
    this.ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    this.ctx.lineTo(x + width, y + height - radius);
    this.ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    this.ctx.lineTo(x + radius, y + height);
    this.ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    this.ctx.lineTo(x, y + radius);
    this.ctx.quadraticCurveTo(x, y, x + radius, y);
    this.ctx.closePath();
  }

  // Smart diagram generation methods
  private createExampleDiagram(content: string) {
    const steps = content.split(/[.!?]/).filter(s => s.trim().length > 0).slice(0, 4);
    const stepHeight = this.state.canvasSize.height / (steps.length + 1);
    
    steps.forEach((step, index) => {
      const y = stepHeight * (index + 1);
      
      this.addShape({
        id: this.generateId(),
        type: 'process-box',
        bounds: { x: 50, y: y - 20, width: 200, height: 40 },
        properties: {
          color: '#3b82f6',
          strokeWidth: 2,
          fillColor: 'rgba(59, 130, 246, 0.1)',
          text: `Step ${index + 1}`
        },
        semanticContext: `Example step ${index + 1}`
      });
      
      if (index < steps.length - 1) {
        this.addShape({
          id: this.generateId(),
          type: 'arrow',
          bounds: { x: 150, y: y + 20, width: 0, height: stepHeight - 40 },
          properties: {
            startX: 150,
            startY: y + 20,
            endX: 150,
            endY: y + stepHeight - 20,
            color: '#10b981',
            strokeWidth: 2
          },
          semanticContext: `Flow to step ${index + 2}`
        });
      }
    });
  }

  private createEvidenceChart(content: string) {
    const evidencePoints = content.split(/[,;]/).filter(s => s.trim().length > 0).slice(0, 4);
    const barWidth = (this.state.canvasSize.width - 100) / evidencePoints.length;
    
    evidencePoints.forEach((evidence, index) => {
      const height = 50 + Math.random() * 100;
      const x = 50 + index * barWidth;
      const y = this.state.canvasSize.height - 100;
      
      this.addShape({
        id: this.generateId(),
        type: 'rectangle',
        bounds: { x, y: y - height, width: barWidth - 10, height },
        properties: {
          color: '#8b5cf6',
          strokeWidth: 2,
          fillColor: 'rgba(139, 92, 246, 0.3)'
        },
        semanticContext: `Evidence: ${evidence.slice(0, 20)}...`
      });
    });
  }

  private createFlowChart(content: string) {
    const flowSteps = content.split(/\b(then|next|after|because|therefore|thus)\b/i)
      .filter(s => s.trim().length > 10)
      .slice(0, 4);
    
    const stepWidth = (this.state.canvasSize.width - 100) / Math.max(flowSteps.length, 1);
    
    flowSteps.forEach((step, index) => {
      const x = 50 + index * stepWidth;
      const y = this.state.canvasSize.height / 2;
      
      this.addShape({
        id: this.generateId(),
        type: 'process-box',
        bounds: { x, y: y - 30, width: stepWidth - 20, height: 60 },
        properties: {
          color: '#f59e0b',
          strokeWidth: 2,
          fillColor: 'rgba(245, 158, 11, 0.1)',
          text: `Flow ${index + 1}`
        },
        semanticContext: `Flow step ${index + 1}`
      });
      
      if (index < flowSteps.length - 1) {
        this.addShape({
          id: this.generateId(),
          type: 'arrow',
          bounds: { x: x + stepWidth - 20, y, width: 20, height: 0 },
          properties: {
            startX: x + stepWidth - 20,
            startY: y,
            endX: x + stepWidth,
            endY: y,
            color: '#ef4444',
            strokeWidth: 2
          },
          semanticContext: `Flow to step ${index + 2}`
        });
      }
    });
  }

  private createConceptMap(sections: any[]) {
    const centerX = this.state.canvasSize.width / 2;
    const centerY = this.state.canvasSize.height / 2;
    const radius = Math.min(this.state.canvasSize.width, this.state.canvasSize.height) * 0.3;
    
    // Central concept
    this.addShape({
      id: this.generateId(),
      type: 'concept-bubble',
      bounds: { x: centerX - 40, y: centerY - 40, width: 80, height: 80 },
      properties: {
        color: '#7c3aed',
        strokeWidth: 3,
        fillColor: 'rgba(124, 58, 237, 0.1)',
        text: 'Main'
      },
      semanticContext: 'Central concept'
    });
    
    // Surrounding concepts
    sections.slice(0, 6).forEach((section, index) => {
      const angle = (index / sections.length) * 2 * Math.PI;
      const x = centerX + radius * Math.cos(angle);
      const y = centerY + radius * Math.sin(angle);
      
      this.addShape({
        id: this.generateId(),
        type: 'concept-bubble',
        bounds: { x: x - 25, y: y - 25, width: 50, height: 50 },
        properties: {
          color: '#2563eb',
          strokeWidth: 2,
          fillColor: 'rgba(37, 99, 235, 0.1)',
          text: `C${index + 1}`
        },
        semanticContext: `Concept ${index + 1}`
      });
      
      // Connection line
      this.addShape({
        id: this.generateId(),
        type: 'line',
        bounds: { x: centerX, y: centerY, width: x - centerX, height: y - centerY },
        properties: {
          startX: centerX + 40 * Math.cos(angle),
          startY: centerY + 40 * Math.sin(angle),
          endX: x - 25 * Math.cos(angle),
          endY: y - 25 * Math.sin(angle),
          color: '#10b981',
          strokeWidth: 2
        },
        semanticContext: `Connection to concept ${index + 1}`
      });
    });
  }

  private suggestConnections() {
    // Find circles that could be connected
    const circles = this.state.shapes.filter(s => s.type === 'circle' || s.type === 'concept-bubble');
    
    for (let i = 0; i < circles.length - 1; i++) {
      for (let j = i + 1; j < circles.length; j++) {
        const shape1 = circles[i];
        const shape2 = circles[j];
        
        const x1 = shape1.bounds.x + shape1.bounds.width / 2;
        const y1 = shape1.bounds.y + shape1.bounds.height / 2;
        const x2 = shape2.bounds.x + shape2.bounds.width / 2;
        const y2 = shape2.bounds.y + shape2.bounds.height / 2;
        
        this.addShape({
          id: this.generateId(),
          type: 'arrow',
          bounds: { x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) },
          properties: {
            startX: x1,
            startY: y1,
            endX: x2,
            endY: y2,
            color: '#10b981',
            strokeWidth: 2
          },
          semanticContext: 'Suggested connection'
        });
      }
    }
  }
}

// Export utility function for easy integration
export const createSmartDrawingEngine = (canvas: HTMLCanvasElement) => {
  return new SmartDrawingEngine(canvas);
};
