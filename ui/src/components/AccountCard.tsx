import { toast } from 'sonner';
import { LogIn, User, Clock, AlertTriangle, CheckCircle2, Trash2 } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { cn } from '@/lib/utils';

interface AccountCardProps {
  provider: string;
  accounts: AccountInfo[];
  activeAccount?: string;
  color: string;
  onLogin: () => void;
  onSwitch: (email: string) => void;
  refetch: () => void;
}

interface AccountInfo {
  email: string;
  isExpired: boolean;
  expiresAt?: string;
  quotaExceeded?: boolean;
}

export function AccountCard({
  provider,
  accounts,
  activeAccount,
  color,
  onLogin,
  onSwitch,
  refetch,
}: AccountCardProps) {
  const handleDelete = async (email: string) => {
    if (!confirm(`Delete account ${email}?`)) return;
    try {
      const res = await fetch(`/api/accounts/${provider}/${encodeURIComponent(email)}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete');
      toast.success(`Deleted ${email}`);
      refetch();
    } catch {
      toast.error('Failed to delete account');
    }
  };

  const formatExpiry = (expiresAt?: string) => {
    if (!expiresAt) return null;
    const date = new Date(expiresAt);
    const diff = date.getTime() - Date.now();
    if (diff < 0) return 'Expired';
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
    return `${hours}h ${minutes}m`;
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <div
            className="size-3 rounded-full"
            style={{ backgroundColor: color }}
          />
          {provider.toUpperCase()}
          <span className="text-muted-foreground font-normal ml-auto">
            {accounts.length} account{accounts.length !== 1 ? 's' : ''}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {accounts.length === 0 ? (
          <div className="text-center py-4">
            <p className="text-sm text-muted-foreground mb-3">No accounts</p>
            <Button variant="outline" size="sm" onClick={onLogin}>
              <LogIn className="size-4" />
              Login
            </Button>
          </div>
        ) : (
          <>
            {accounts.map((account) => (
              <div
                key={account.email}
                className={cn(
                  'flex items-center gap-2 p-2 rounded-lg text-sm',
                  account.email === activeAccount ? 'bg-accent/10 border border-accent/20' : 'hover:bg-muted'
                )}
              >
                <User className="size-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="truncate font-medium">{account.email}</div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {account.isExpired ? (
                      <span className="flex items-center gap-1 text-red-600">
                        <AlertTriangle className="size-3" />
                        Expired
                      </span>
                    ) : account.quotaExceeded ? (
                      <span className="flex items-center gap-1 text-yellow-600">
                        <AlertTriangle className="size-3" />
                        Quota exceeded
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-green-600">
                        <CheckCircle2 className="size-3" />
                        Active
                      </span>
                    )}
                    {account.expiresAt && (
                      <span className="flex items-center gap-1">
                        <Clock className="size-3" />
                        {formatExpiry(account.expiresAt)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {account.email !== activeAccount && !account.isExpired && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => onSwitch(account.email)}
                      title="Set as active"
                    >
                      <CheckCircle2 className="size-4" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => handleDelete(account.email)}
                    title="Delete"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
            <Button variant="outline" size="sm" className="w-full mt-2" onClick={onLogin}>
              <LogIn className="size-4" />
              Add Account
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

