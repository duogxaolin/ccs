import { useQuery } from '@tanstack/react-query';
import { Dashboard } from './components/Dashboard';

// API functions
async function fetchHealth() {
  const res = await fetch('/api/health');
  if (!res.ok) throw new Error('Failed to fetch health');
  return res.json();
}

async function fetchStats() {
  const res = await fetch('/api/stats');
  if (!res.ok) throw new Error('Failed to fetch stats');
  return res.json();
}

async function fetchAccounts() {
  const res = await fetch('/api/accounts/status');
  if (!res.ok) throw new Error('Failed to fetch accounts');
  return res.json();
}

async function fetchCliproxyStatus() {
  const res = await fetch('/api/cliproxy/status');
  if (!res.ok) throw new Error('Failed to fetch cliproxy status');
  return res.json();
}

function App() {
  const healthQuery = useQuery({
    queryKey: ['health'],
    queryFn: fetchHealth,
    refetchInterval: 30000,
  });

  const statsQuery = useQuery({
    queryKey: ['stats'],
    queryFn: fetchStats,
    refetchInterval: 10000,
  });

  const accountsQuery = useQuery({
    queryKey: ['accounts'],
    queryFn: fetchAccounts,
    refetchInterval: 30000,
  });

  const cliproxyQuery = useQuery({
    queryKey: ['cliproxy'],
    queryFn: fetchCliproxyStatus,
    refetchInterval: 30000,
  });

  return (
    <div className="min-h-screen bg-background">
      <Dashboard
        health={healthQuery.data}
        stats={statsQuery.data}
        accounts={accountsQuery.data}
        cliproxy={cliproxyQuery.data}
        isLoading={healthQuery.isLoading || accountsQuery.isLoading}
        refetchAccounts={accountsQuery.refetch}
      />
    </div>
  );
}

export default App;

