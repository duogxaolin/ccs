import { useState } from 'react';
import { toast } from 'sonner';
import {
  Server,
  RefreshCw,
  LogIn,
  Settings,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Moon,
  Sun,
  Copy,
} from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { AccountCard } from './AccountCard';
import { OAuthDialog } from './OAuthDialog';
import { cn, getProviderColor } from '@/lib/utils';

interface DashboardProps {
  health?: { status: string; uptime: number };
  stats?: { totalRequests: number; successRate: number; byProvider: Record<string, number> };
  accounts?: { providers: ProviderStatus[] };
  cliproxy?: { running: boolean; port: number };
  isLoading: boolean;
  refetchAccounts: () => void;
}

interface ProviderStatus {
  provider: string;
  accounts: AccountInfo[];
  activeAccount?: string;
}

interface AccountInfo {
  email: string;
  isExpired: boolean;
  expiresAt?: string;
  quotaExceeded?: boolean;
}

const PROVIDERS = ['agy', 'gemini', 'codex', 'qwen', 'kiro', 'iflow', 'ghcp'] as const;

export function Dashboard({
  health,
  stats,
  accounts,
  cliproxy,
  isLoading,
  refetchAccounts,
}: DashboardProps) {
  const [darkMode, setDarkMode] = useState(false);
  const [oauthDialogOpen, setOauthDialogOpen] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<string>('agy');

  const toggleDarkMode = () => {
    setDarkMode(!darkMode);
    document.documentElement.classList.toggle('dark');
  };

  const copyEndpoint = () => {
    const endpoint = `${window.location.origin}/proxy/api/provider/agy`;
    navigator.clipboard.writeText(endpoint);
    toast.success('Endpoint copied to clipboard');
  };

  const handleLogin = (provider: string) => {
    setSelectedProvider(provider);
    setOauthDialogOpen(true);
  };

  const getStatusIcon = () => {
    if (isLoading) return <RefreshCw className="size-5 animate-spin text-muted-foreground" />;
    if (health?.status === 'ok' && cliproxy?.running) {
      return <CheckCircle2 className="size-5 text-green-600" />;
    }
    if (health?.status === 'ok') {
      return <AlertCircle className="size-5 text-yellow-600" />;
    }
    return <XCircle className="size-5 text-red-600" />;
  };

  return (
    <div className={cn('min-h-screen', darkMode && 'dark')}>
      <div className="mx-auto max-w-6xl p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Server className="size-8 text-accent" />
            <div>
              <h1 className="text-2xl font-bold">CCS Remote Dashboard</h1>
              <p className="text-sm text-muted-foreground">
                Claude Code Switch - Remote Proxy Server
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={toggleDarkMode}>
              {darkMode ? <Sun className="size-5" /> : <Moon className="size-5" />}
            </Button>
            <Button variant="ghost" size="icon" onClick={() => refetchAccounts()}>
              <RefreshCw className="size-5" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setOauthDialogOpen(true)}>
              <LogIn className="size-4" />
              Add Account
            </Button>
          </div>
        </div>

        {/* Status Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Server Status */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                {getStatusIcon()}
                Server Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <span className={health?.status === 'ok' ? 'text-green-600' : 'text-red-600'}>
                    {health?.status || 'Unknown'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Uptime</span>
                  <span>{health?.uptime ? `${Math.floor(health.uptime / 60)}m` : '-'}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* CLIProxy Status */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Settings className="size-4" />
                CLIProxy
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Running</span>
                  <span className={cliproxy?.running ? 'text-green-600' : 'text-red-600'}>
                    {cliproxy?.running ? 'Yes' : 'No'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Port</span>
                  <span>{cliproxy?.port || '-'}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Request Stats */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Request Stats</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Requests</span>
                  <span>{stats?.totalRequests || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Success Rate</span>
                  <span>{stats?.successRate ? `${stats.successRate.toFixed(1)}%` : '-'}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Claude Code Configuration */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Claude Code Configuration</CardTitle>
            <CardDescription>
              Set these environment variables in your Claude Code client
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="bg-muted rounded-lg p-4 font-mono text-sm space-y-2">
              <div className="flex items-center justify-between">
                <code>ANTHROPIC_BASE_URL={window.location.origin}/proxy/api/provider/agy</code>
                <Button variant="ghost" size="icon-sm" onClick={copyEndpoint}>
                  <Copy className="size-4" />
                </Button>
              </div>
              <div>
                <code>ANTHROPIC_AUTH_TOKEN=your-api-key</code>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Accounts by Provider */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Accounts</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {PROVIDERS.map((provider) => {
              const providerData = accounts?.providers?.find((p) => p.provider === provider);
              return (
                <AccountCard
                  key={provider}
                  provider={provider}
                  accounts={providerData?.accounts || []}
                  activeAccount={providerData?.activeAccount}
                  color={getProviderColor(provider)}
                  onLogin={() => handleLogin(provider)}
                  onSwitch={(email) => handleSwitchAccount(provider, email)}
                  refetch={refetchAccounts}
                />
              );
            })}
          </div>
        </div>

        {/* OAuth Dialog */}
        <OAuthDialog
          open={oauthDialogOpen}
          onOpenChange={setOauthDialogOpen}
          provider={selectedProvider}
          onProviderChange={setSelectedProvider}
          onSuccess={refetchAccounts}
        />
      </div>
    </div>
  );

  async function handleSwitchAccount(provider: string, email: string) {
    try {
      const res = await fetch(`/api/accounts/${provider}/switch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) throw new Error('Failed to switch account');
      toast.success(`Switched to ${email}`);
      refetchAccounts();
    } catch {
      toast.error('Failed to switch account');
    }
  }
}

