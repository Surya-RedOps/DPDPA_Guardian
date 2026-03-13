import React from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { ScrollText, ShieldCheck, Link } from 'lucide-react'
import api from '../../lib/axios'
import toast from 'react-hot-toast'
import { format } from 'date-fns'

export default function AuditLog() {
  const { data, isLoading } = useQuery({
    queryKey: ['audit'],
    queryFn: () => api.get('/dashboard/audit', { params: { limit: 50 } }).then(r => r.data.data)
  })

  const logs = data?.logs || []
  const total = data?.total || 0

  const verifyMut = useMutation({
    mutationFn: () => api.get('/dashboard/audit/verify').then(r => r.data.data),
    onSuccess: (d) => toast.success(d.message || (d.valid ? 'Chain integrity verified!' : 'Chain integrity violation!')),
    onError: () => toast.error('Verification failed')
  })

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, marginBottom: 4 }}>Audit Log</h1>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>Immutable audit trail with SHA-256 hash chain verification</div>
        </div>
        <button onClick={() => verifyMut.mutate()} disabled={verifyMut.isPending} className="btn-secondary">
          <ShieldCheck size={14} /> Verify Chain Integrity
        </button>
      </div>

      <div style={{ padding: '10px 16px', background: 'rgba(0,229,255,0.05)', border: '1px solid rgba(0,229,255,0.1)', borderRadius: 8, marginBottom: 20, fontSize: 12, color: 'var(--muted)', display: 'flex', gap: 8, alignItems: 'center' }}>
        <Link size={12} style={{ color: 'var(--c1)' }} />
        <span>Every entry is hashed and linked to the previous entry. Tampering with any record breaks the chain and is immediately detectable.</span>
      </div>

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--muted)' }}>Loading audit log...</div>
      ) : logs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 24px', color: 'var(--muted)' }}>
          <ScrollText size={48} style={{ opacity: 0.3, marginBottom: 16 }} />
          <h3 style={{ color: 'var(--text)', marginBottom: 8 }}>No audit entries yet</h3>
          <p>Actions taken in the system will appear here</p>
        </div>
      ) : (
        <div style={{ background: 'var(--s1)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          <div className="table-row table-header" style={{ gridTemplateColumns: '1.5fr 1fr 2fr 1fr 1fr' }}>
            <span>ACTION</span><span>USER</span><span>DETAILS</span><span>OUTCOME</span><span>TIME</span>
          </div>
          {logs.map((entry, i) => (
            <motion.div key={entry._id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}
              className="table-row" style={{ gridTemplateColumns: '1.5fr 1fr 2fr 1fr 1fr' }}>
              <div style={{ fontFamily: 'JetBrains Mono', fontSize: 12, color: 'var(--c1)' }}>{entry.action}</div>
              <div>
                <div style={{ fontSize: 12, color: 'var(--text)' }}>{entry.userEmail?.split('@')[0] || 'system'}</div>
                <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'JetBrains Mono', textTransform: 'uppercase' }}>{entry.userRole}</div>
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {entry.resourceType && `${entry.resourceType} • `}{entry.ipAddress}
              </div>
              <span className={`badge badge-${entry.outcome === 'success' ? 'low' : 'critical'}`} style={{ fontSize: 9, width: 'fit-content' }}>
                {entry.outcome}
              </span>
              <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'JetBrains Mono' }}>
                {format(new Date(entry.timestamp), 'dd/MM HH:mm:ss')}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}
