import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Loader2, ExternalLink, Copy, CheckCircle2 } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';

interface OAuthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  provider: string;
  onProviderChange: (provider: string) => void;
  onSuccess: () => void;
}

const PROVIDERS = [
  { id: 'agy', name: 'Antigravity', color: '#f3722c' },
  { id: 'gemini', name: 'Gemini', color: '#277da1' },
  { id: 'codex', name: 'Codex', color: '#f8961e' },
  { id: 'qwen', name: 'Qwen', color: '#f9c74f' },
  { id: 'kiro', name: 'Kiro', color: '#4d908e' },
];

type OAuthFlow = 'idle' | 'starting' | 'waiting' | 'success' | 'error';

export function OAuthDialog({
  open,
  onOpenChange,
  provider,
  onProviderChange,
  onSuccess,
}: OAuthDialogProps) {
  const [flowState, setFlowState] = useState<OAuthFlow>('idle');
  const [deviceCode, setDeviceCode] = useState<{ userCode: string; verificationUrl: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setFlowState('idle');
      setDeviceCode(null);
      setError(null);
    }
  }, [open]);

  const startOAuth = async () => {
    setFlowState('starting');
    setError(null);

    try {
      const res = await fetch(`/oauth/${provider}/start`, {
        method: 'POST',
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to start OAuth');
      }

      const data = await res.json();

      if (data.flow === 'device') {
        // Device code flow
        setDeviceCode({
          userCode: data.userCode,
          verificationUrl: data.verificationUrl,
        });
        setFlowState('waiting');
        pollForCompletion(data.pollUrl);
      } else if (data.authUrl) {
        // Authorization code flow - open in new window
        window.open(data.authUrl, '_blank', 'width=600,height=700');
        setFlowState('waiting');
        pollForCompletion(`/oauth/${provider}/poll`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'OAuth failed');
      setFlowState('error');
    }
  };

  const pollForCompletion = async (pollUrl: string) => {
    const maxAttempts = 60; // 5 minutes
    for (let i = 0; i < maxAttempts; i++) {
      try {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        const res = await fetch(pollUrl);
        const data = await res.json();

        if (data.status === 'complete') {
          setFlowState('success');
          toast.success(`Logged in as ${data.email}`);
          onSuccess();
          setTimeout(() => onOpenChange(false), 1500);
          return;
        } else if (data.status === 'error') {
          throw new Error(data.error || 'OAuth failed');
        }
        // Continue polling if status is 'pending'
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Polling failed');
        setFlowState('error');
        return;
      }
    }
    setError('OAuth timed out');
    setFlowState('error');
  };

  const copyCode = () => {
    if (deviceCode?.userCode) {
      navigator.clipboard.writeText(deviceCode.userCode);
      toast.success('Code copied');
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <Card className="w-full max-w-md mx-4">
        <CardHeader>
          <CardTitle>Add Account</CardTitle>
          <CardDescription>
            Login with OAuth to add a new account
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Provider Selection */}
          <div className="flex flex-wrap gap-2">
            {PROVIDERS.map((p) => (
              <Button
                key={p.id}
                variant={provider === p.id ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  onProviderChange(p.id);
                  setFlowState('idle');
                }}
                style={provider === p.id ? { backgroundColor: p.color } : {}}
              >
                {p.name}
              </Button>
            ))}
          </div>

          {/* Flow States */}
          {flowState === 'idle' && (
            <Button className="w-full" onClick={startOAuth}>
              Start OAuth Login
            </Button>
          )}

          {flowState === 'starting' && (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
              <span className="ml-2">Starting OAuth...</span>
            </div>
          )}

          {flowState === 'waiting' && deviceCode && (
            <div className="space-y-4 text-center">
              <div className="bg-muted rounded-lg p-4">
                <p className="text-sm text-muted-foreground mb-2">Enter this code:</p>
                <div className="flex items-center justify-center gap-2">
                  <code className="text-2xl font-bold tracking-widest">{deviceCode.userCode}</code>
                  <Button variant="ghost" size="icon-sm" onClick={copyCode}>
                    <Copy className="size-4" />
                  </Button>
                </div>
              </div>
              <Button variant="outline" className="w-full" asChild>
                <a href={deviceCode.verificationUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="size-4" />
                  Open Verification Page
                </a>
              </Button>
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Waiting for authorization...
              </div>
            </div>
          )}

          {flowState === 'waiting' && !deviceCode && (
            <div className="flex items-center justify-center py-4 gap-2">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
              <span>Complete login in the popup window...</span>
            </div>
          )}

          {flowState === 'success' && (
            <div className="flex items-center justify-center py-4 gap-2 text-green-600">
              <CheckCircle2 className="size-6" />
              <span>Login successful!</span>
            </div>
          )}

          {flowState === 'error' && (
            <div className="space-y-4">
              <div className="text-red-600 text-center">{error}</div>
              <Button className="w-full" onClick={startOAuth}>
                Try Again
              </Button>
            </div>
          )}

          {/* Close button */}
          <Button variant="ghost" className="w-full" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

