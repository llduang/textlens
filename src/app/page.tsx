'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import katex from 'katex';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Upload,
  Sparkles,
  Copy,
  Check,
  RotateCcw,
  ImagePlus,
  X,
  FileText,
  BookOpen,
  Globe,
  Loader2,
  AlertCircle,
  ImageIcon,
  Keyboard,
  Wand2,
  ClipboardCopy,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

type FormatId = 'typora' | 'word' | 'web';

interface FormatOption {
  id: FormatId;
  label: string;
  icon: React.ReactNode;
  description: string;
  transform: (raw: string) => string;
}

// ─── Format Definitions ─────────────────────────────────────────────────────

const FORMAT_OPTIONS: FormatOption[] = [
  {
    id: 'typora',
    label: 'Typora',
    icon: <BookOpen className="w-3.5 h-3.5" />,
    description: 'Markdown + LaTeX，适用于 Typora 等 Markdown 编辑器',
    transform: (raw: string) => raw,
  },
  {
    id: 'word',
    label: 'Word',
    icon: <FileText className="w-3.5 h-3.5" />,
    description: '带 MathML 的 HTML 格式，可直接粘贴到 Word 中渲染公式',
    transform: (raw: string) => markdownToWordHTML(raw),
  },
  {
    id: 'web',
    label: '网页输入框',
    icon: <Globe className="w-3.5 h-3.5" />,
    description: '纯文本 + LaTeX 标记，适用于网页表单和文本输入',
    transform: (raw: string) => {
      let result = raw;
      result = result.replace(/\$\$([\s\S]*?)\$\$/g, (_, formula) => `\\[${formula.trim()}\\]`);
      result = result.replace(/\$([^\$\n]+?)\$/g, (_, formula) => `\\(${formula}\\)`);
      return result;
    },
  },
];

// ─── Utility Functions ───────────────────────────────────────────────────────

function markdownToWordHTML(md: string): string {
  let html = md;

  html = html.replace(/\$\$([\s\S]*?)\$\$/g, (_, formula) => {
    try {
      const mathml = katex.renderToString(formula.trim(), {
        output: 'mathml',
        throwOnError: false,
        displayMode: true,
      });
      return `<p>${mathml}</p>`;
    } catch {
      return `<p>$$${formula.trim()}$$</p>`;
    }
  });

  html = html.replace(/\$([^\$\n]+?)\$/g, (_, formula) => {
    try {
      const mathml = katex.renderToString(formula.trim(), {
        output: 'mathml',
        throwOnError: false,
        displayMode: false,
      });
      return mathml;
    } catch {
      return `$${formula}$`;
    }
  });

  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/^[-*] (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, (match) => `<ul>${match}</ul>`);
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

  html = html
    .split('\n\n')
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return '';
      if (trimmed.startsWith('<h') || trimmed.startsWith('<ul') || trimmed.startsWith('<ol') || trimmed.startsWith('<p>')) {
        return trimmed;
      }
      return `<p>${trimmed.replace(/\n/g, '<br>')}</p>`;
    })
    .join('\n');

  return html;
}

function renderResultToHTML(raw: string): { html: string; hasError: boolean } {
  try {
    let html = raw;

    html = html.replace(/\$\$([\s\S]*?)\$\$/g, (match, formula) => {
      try {
        return katex.renderToString(formula.trim(), {
          throwOnError: false,
          displayMode: true,
        });
      } catch {
        return `<span class="text-red-500 text-sm">[公式渲染失败: ${formula.trim()}]</span>`;
      }
    });

    html = html.replace(/\$([^\$\n]+?)\$/g, (match, formula) => {
      try {
        return katex.renderToString(formula.trim(), {
          throwOnError: false,
          displayMode: false,
        });
      } catch {
        return `<span class="text-red-500 text-sm">[公式渲染失败: ${formula.trim()}]</span>`;
      }
    });

    html = html.replace(/^### (.+)$/gm, '<h3 class="text-base font-semibold mt-3 mb-1">$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2 class="text-lg font-semibold mt-4 mb-1">$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1 class="text-xl font-bold mt-4 mb-2">$1</h1>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    html = html.replace(/\n/g, '<br>');

    return { html, hasError: false };
  } catch {
    return { html: raw, hasError: true };
  }
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function Home() {
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [rawImageData, setRawImageData] = useState<string | null>(null);
  const [recognizeResult, setRecognizeResult] = useState<string>('');
  const [isRecognizing, setIsRecognizing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFormat, setSelectedFormat] = useState<FormatId>('typora');
  const [copied, setCopied] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [editText, setEditText] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // ─── Image Input Handlers ───────────────────────────────────────────────

  const compressImage = useCallback((dataUrl: string, maxWidth: number = 2048, quality: number = 0.9): Promise<string> => {
    return new Promise((resolve) => {
      const img = new window.Image();
      img.onload = () => {
        // If image is small enough, return as-is (don't over-compress)
        if (img.width <= maxWidth && dataUrl.length < 4 * 1024 * 1024) {
          resolve(dataUrl);
          return;
        }
        const scale = maxWidth / img.width;
        const canvas = document.createElement('canvas');
        canvas.width = maxWidth;
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(dataUrl); return; }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const compressed = canvas.toDataURL('image/png', quality);
        resolve(compressed);
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  }, []);

  const handleImageInput = useCallback(async (dataUrl: string) => {
    setImagePreview(dataUrl);
    const compressed = await compressImage(dataUrl);
    setRawImageData(compressed);
    setRecognizeResult('');
    setError(null);
  }, [compressImage]);

  const handlePaste = useCallback((e: ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) continue;
        const reader = new FileReader();
        reader.onload = (ev) => {
          const result = ev.target?.result as string;
          handleImageInput(result);
        };
        reader.readAsDataURL(file);
        return;
      }
    }
  }, [handleImageInput]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast({ title: '不支持的文件类型', description: '请选择图片文件', variant: 'destructive' });
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      handleImageInput(result);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }, [handleImageInput, toast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!file || !file.type.startsWith('image/')) {
      toast({ title: '不支持的文件类型', description: '请拖入图片文件', variant: 'destructive' });
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      handleImageInput(result);
    };
    reader.readAsDataURL(file);
  }, [handleImageInput, toast]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const clearImage = useCallback(() => {
    setImagePreview(null);
    setRawImageData(null);
    setRecognizeResult('');
    setEditText('');
    setError(null);
  }, []);

  const changeImage = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // ─── Global paste listener ─────────────────────────────────────────────

  useEffect(() => {
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [handlePaste]);

  // ─── Recognition ────────────────────────────────────────────────────────

  const recognizeImage = useCallback(async () => {
    if (!rawImageData) return;
    setIsRecognizing(true);
    setError(null);
    setRecognizeResult('');

    try {
      const response = await fetch('/api/recognize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: rawImageData }),
      });

      const data = await response.json();

      if (!data.success) {
        setError(data.error || '识别失败，请重试');
        return;
      }

      setRecognizeResult(data.result);
      setEditText(data.result);
    } catch {
      setError('网络错误，请检查网络连接后重试');
    } finally {
      setIsRecognizing(false);
    }
  }, [rawImageData]);

  // Auto-recognize when image is set
  useEffect(() => {
    if (rawImageData && !recognizeResult && !isRecognizing && !error) {
      recognizeImage();
    }
  }, [rawImageData, recognizeImage]);

  // ─── Copy ───────────────────────────────────────────────────────────────

  const formattedOutput = useMemo(() => {
    if (!editText) return '';
    const fmt = FORMAT_OPTIONS.find((f) => f.id === selectedFormat);
    return fmt ? fmt.transform(editText) : editText;
  }, [editText, selectedFormat]);

  const copyFormatted = useCallback(async () => {
    if (!formattedOutput) return;

    try {
      if (selectedFormat === 'word') {
        const htmlContent = formattedOutput;
        const textContent = editText;
        const htmlBlob = new Blob([htmlContent], { type: 'text/html' });
        const textBlob = new Blob([textContent], { type: 'text/plain' });
        const clipboardItem = new ClipboardItem({
          'text/html': htmlBlob,
          'text/plain': textBlob,
        });
        await navigator.clipboard.write([clipboardItem]);
      } else {
        await navigator.clipboard.writeText(formattedOutput);
      }

      setCopied(true);
      const fmt = FORMAT_OPTIONS.find((f) => f.id === selectedFormat);
      toast({
        title: '已复制',
        description: `已以「${fmt?.label ?? selectedFormat}」格式复制到剪贴板`,
      });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({
        title: '复制失败',
        description: '请手动选择并复制',
        variant: 'destructive',
      });
    }
  }, [formattedOutput, selectedFormat, editText, toast]);

  // ─── Rendered preview ──────────────────────────────────────────────────

  const renderedPreview = useMemo(() => {
    if (!editText) return { html: '', hasError: false };
    return renderResultToHTML(editText);
  }, [editText]);

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-stone-50 to-white">
      {/* ─── Header ──────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-white/80 border-b border-stone-200/60">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-md shadow-emerald-200">
              <Wand2 className="w-[18px] h-[18px] text-white" />
            </div>
            <span className="text-lg font-bold tracking-tight bg-gradient-to-r from-emerald-700 to-teal-600 bg-clip-text text-transparent">
              TextLens
            </span>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-emerald-50 text-emerald-700 border-emerald-200/60">
              图文识别
            </Badge>
          </div>
        </div>
      </header>

      {/* ─── Main Content ────────────────────────────────────────────────── */}
      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-8">
        {/* Hero section */}
        {!imagePreview && !editText && (
          <div className="text-center mb-8 animate-in fade-in slide-in-from-4 duration-500">
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-2">
              <span className="bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
                图片文字与公式识别
              </span>
            </h1>
            <p className="text-stone-500 text-sm sm:text-base max-w-lg mx-auto">
              粘贴包含文字和数学公式的图片，AI 自动识别并转换为可编辑文本，支持多种格式复制
            </p>
          </div>
        )}

        {/* ─── Upload Zone ──────────────────────────────────────────────── */}
        {!imagePreview && !editText && (
          <div className="space-y-6 animate-in fade-in slide-in-from-4 duration-700">
            <Card
              className={`border-2 border-dashed transition-all duration-200 cursor-pointer ${
                isDragging
                  ? 'border-emerald-400 bg-emerald-50/50 scale-[1.01]'
                  : 'border-stone-300/80 hover:border-emerald-400 hover:bg-emerald-50/30'
              }`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
            >
              <CardContent className="flex flex-col items-center justify-center py-16 sm:py-20">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-100 to-teal-100 flex items-center justify-center mb-4">
                  <Upload className="w-7 h-7 text-emerald-600" />
                </div>
                <p className="text-base font-medium text-stone-700 mb-1">
                  粘贴或上传图文图片
                </p>
                <p className="text-xs text-stone-400 mb-4">
                  支持 Ctrl+V 粘贴 · 拖拽上传 · 点击选择文件
                </p>
                <div className="flex gap-1.5">
                  {['PNG', 'JPG', 'WebP', 'GIF'].map((fmt) => (
                    <Badge key={fmt} variant="secondary" className="text-[10px] px-1.5 py-0 bg-stone-100 text-stone-500">
                      {fmt}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
            />

            {/* Tips */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                {
                  icon: <Keyboard className="w-5 h-5 text-emerald-600" />,
                  title: '快捷粘贴',
                  desc: 'Ctrl+V 一键粘贴截图',
                },
                {
                  icon: <Sparkles className="w-5 h-5 text-amber-500" />,
                  title: 'AI 识别',
                  desc: '智能识别文字与公式',
                },
                {
                  icon: <ClipboardCopy className="w-5 h-5 text-violet-500" />,
                  title: '多格式复制',
                  desc: 'Typora / Word / 网页',
                },
              ].map((tip) => (
                <Card key={tip.title} className="bg-white/60 backdrop-blur-sm border-stone-200/60">
                  <CardContent className="flex items-start gap-3 p-4">
                    <div className="mt-0.5">{tip.icon}</div>
                    <div>
                      <p className="text-sm font-medium text-stone-800">{tip.title}</p>
                      <p className="text-xs text-stone-400">{tip.desc}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* ─── Image Preview + Recognition Result ───────────────────────── */}
        {(imagePreview || editText) && (
          <div className="space-y-4 animate-in fade-in slide-in-from-4 duration-500">
            {/* Image Preview Card */}
            {imagePreview && (
              <Card className="border-stone-200/80 overflow-hidden">
                <div className="bg-stone-50 px-4 py-2.5 flex items-center justify-between border-b border-stone-200/60">
                  <span className="text-sm font-medium text-stone-700 flex items-center gap-1.5">
                    <ImageIcon className="w-3.5 h-3.5" />
                    原始图片
                  </span>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={changeImage} className="h-7 text-xs text-stone-500 hover:text-stone-800">
                      <ImagePlus className="w-3.5 h-3.5 mr-1" />
                      更换
                    </Button>
                    <Button variant="ghost" size="sm" onClick={clearImage} className="h-7 text-xs text-stone-500 hover:text-red-600">
                      <X className="w-3.5 h-3.5 mr-1" />
                      清除
                    </Button>
                  </div>
                </div>
                <CardContent className="p-4 bg-white">
                  <ScrollArea className="max-h-72">
                    <div className="flex justify-center">
                      <img
                        src={imagePreview}
                        alt="上传的图片"
                        className="max-h-72 object-contain rounded-lg shadow-sm"
                      />
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
            />

            {/* Loading State */}
            {isRecognizing && (
              <Card className="border-emerald-200/60 bg-gradient-to-br from-emerald-50/50 to-teal-50/50">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 text-emerald-600 animate-spin mb-3" />
                  <p className="text-sm font-medium text-emerald-700">正在识别文字与公式...</p>
                  <p className="text-xs text-emerald-500/70 mt-1">AI 正在分析图片内容，如遇高峰期可能需要等待</p>
                </CardContent>
              </Card>
            )}

            {/* Error State */}
            {error && (
              <Card className="border-red-200/60 bg-red-50/50">
                <CardContent className="flex flex-col items-center justify-center py-10">
                  <AlertCircle className="w-8 h-8 text-red-500 mb-3" />
                  <p className="text-sm font-medium text-red-700">{error}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={recognizeImage}
                    className="mt-4 border-red-200 text-red-600 hover:bg-red-50"
                  >
                    <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                    重新识别
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Recognition Result */}
            {editText && !isRecognizing && (
              <>
                {/* Rendered Preview */}
                <Card className="border-stone-200/80 overflow-hidden">
                  <div className="bg-stone-50 px-4 py-2.5 flex items-center justify-between border-b border-stone-200/60">
                    <span className="text-sm font-medium text-stone-700 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
                      识别预览
                    </span>
                  </div>
                  <CardContent className="p-4">
                    <ScrollArea className="h-[320px]">
                      <div
                        className="rendered-content text-sm leading-relaxed text-stone-800"
                        dangerouslySetInnerHTML={{ __html: renderedPreview.html }}
                      />
                    </ScrollArea>
                  </CardContent>
                </Card>

                {/* Format Selector + Output */}
                <Card className="border-stone-200/80 overflow-hidden">
                  <div className="bg-stone-50 px-4 py-2.5 border-b border-stone-200/60">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-stone-700">复制格式</span>
                      <Button
                        onClick={copyFormatted}
                        size="sm"
                        className={`h-8 text-xs font-medium transition-all ${
                          copied
                            ? 'bg-emerald-600 hover:bg-emerald-600 text-white'
                            : 'bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white shadow-sm shadow-emerald-200'
                        }`}
                      >
                        {copied ? (
                          <>
                            <Check className="w-3.5 h-3.5 mr-1" />
                            已复制
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5 mr-1" />
                            复制
                          </>
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* Format Tabs */}
                  <div className="px-4 py-2 border-b border-stone-100 flex gap-1.5 no-scrollbar overflow-x-auto">
                    {FORMAT_OPTIONS.map((fmt) => (
                      <button
                        key={fmt.id}
                        onClick={() => setSelectedFormat(fmt.id)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                          selectedFormat === fmt.id
                            ? 'bg-emerald-100 text-emerald-700 shadow-sm'
                            : 'text-stone-500 hover:bg-stone-100 hover:text-stone-700'
                        }`}
                      >
                        {fmt.icon}
                        {fmt.label}
                      </button>
                    ))}
                  </div>

                  {/* Editable Text Area */}
                  <CardContent className="p-0">
                    <div className="relative">
                      <textarea
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        className="w-full min-h-[160px] max-h-64 p-4 text-xs leading-relaxed font-mono text-emerald-400 bg-stone-950 whitespace-pre-wrap break-words resize-y overflow-auto outline-none border-none focus:ring-0 focus:outline-none"
                        placeholder="识别结果将在此显示，您可以直接编辑..."
                      />
                      <button
                        onClick={copyFormatted}
                        className="absolute top-2 right-2 p-1.5 rounded-md bg-stone-800/80 text-stone-400 hover:text-white hover:bg-stone-700 transition-colors"
                        title="复制"
                      >
                        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </CardContent>

                  {/* Format Description */}
                  <div className="px-4 py-2 bg-stone-50/50 border-t border-stone-100">
                    <p className="text-[11px] text-stone-400">
                      {FORMAT_OPTIONS.find((f) => f.id === selectedFormat)?.description}
                    </p>
                  </div>
                </Card>

                {/* Bottom Actions */}
                <div className="flex gap-2 justify-center">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={recognizeImage}
                    disabled={isRecognizing}
                    className="border-stone-200 text-stone-600"
                  >
                    <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                    重新识别
                  </Button>
                  {imagePreview ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={changeImage}
                      className="border-stone-200 text-stone-600"
                    >
                      <ImagePlus className="w-3.5 h-3.5 mr-1.5" />
                      更换图片
                    </Button>
                  ) : null}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={clearImage}
                    className="border-stone-200 text-stone-600 hover:text-red-600 hover:border-red-200"
                  >
                    <X className="w-3.5 h-3.5 mr-1.5" />
                    清除
                  </Button>
                </div>
              </>
            )}

            {/* Hint */}
            {editText && !imagePreview && !isRecognizing && (
              <div className="text-center">
                <p className="text-xs text-stone-400">
                  按 Ctrl+V 粘贴新图片即可重新识别
                </p>
              </div>
            )}
          </div>
        )}
      </main>

      {/* ─── Footer ───────────────────────────────────────────────────────── */}
      <footer className="py-4 text-center text-xs text-stone-400 border-t border-stone-100">
        <p>TextLens · 基于 AI 视觉模型的图文识别工具</p>
      </footer>
    </div>
  );
}
