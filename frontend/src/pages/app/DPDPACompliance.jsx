import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Shield, CheckCircle, AlertCircle, XCircle } from 'lucide-react'
import api from '../../lib/axios'

const STATUS_ICONS = {
  compliant: { icon: CheckCircle, color: 'var(--c4)', label: 'COMPLIANT' },
  partial: { icon: AlertCircle, color: 'var(--c5)', label: 'PARTIAL' },
  non_compliant: { icon: XCircle, color: 'var(--c3)', label: 'NON-COMPLIANT' },
}

export default function DPDPACompliance() {
  const { data: compliance, isLoading } = useQuery({
    queryKey: ['compliance'],
    queryFn: () => api.get('/dashboard/compliance').then(r => r.data.data),
    refetchInterval: 5000 // Auto-refresh every 5 seconds
  })

  const score = compliance?.score || 0
  const checklist = compliance?.checklist || []
  const pillars = compliance?.pillars || { consent: 0, rights: 0, obligations: 0, technical: 0 }

  const scoreColor = score >= 80 ? 'var(--c4)' : score >= 60 ? 'var(--c5)' : 'var(--c3)'

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, marginBottom: 4 }}>DPDPA 2023 Compliance</h1>
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>Digital Personal Data Protection Act 2023 readiness tracker</div>
      </div>

      {/* Score cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 20, marginBottom: 24 }}>
        <div className="card" style={{ textAlign: 'center', padding: 24 }}>
          <div style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 64, color: scoreColor, lineHeight: 1 }}>{score}</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'JetBrains Mono', marginTop: 4 }}>COMPLIANCE SCORE</div>
          <div className="progress-bar" style={{ marginTop: 16 }}>
            <div className="progress-fill" style={{ width: `${score}%`, background: `linear-gradient(90deg, ${scoreColor}, ${scoreColor}88)` }} />
          </div>
        </div>

        <div className="card">
          <h3 style={{ fontSize: 15, marginBottom: 16 }}>Compliance by Pillar</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {Object.entries(pillars).map(([key, val]) => (
              <div key={key}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 13, color: 'var(--text)', textTransform: 'capitalize' }}>{key} Management</span>
                  <span style={{ fontFamily: 'JetBrains Mono', fontSize: 13, color: val >= 80 ? 'var(--c4)' : val >= 60 ? 'var(--c5)' : 'var(--c3)' }}>{val}%</span>
                </div>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${val}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Checklist */}
      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: 15 }}>DPDPA Section Compliance Checklist</h3>
        </div>
        <div>
          {checklist.map((item, i) => {
            const cfg = STATUS_ICONS[item.status] || STATUS_ICONS.partial
            return (
              <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                style={{ padding: '16px 20px', borderBottom: i < checklist.length - 1 ? '1px solid var(--border)' : 'none', display: 'flex', gap: 16, alignItems: 'center' }}>
                <cfg.icon size={18} style={{ color: cfg.color, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 4 }}>
                    <span className="badge badge-info" style={{ fontSize: 9 }}>{item.section}</span>
                    <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>{item.requirement}</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>{item.evidence || 'No evidence linked'}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <select 
                    value={item.status}
                    onChange={async (e) => {
                      try {
                        await api.patch(`/dashboard/compliance/${item._id}`, { status: e.target.value })
                        window.location.reload() // Simple refresh to update score
                      } catch (err) {
                        console.error('Update failed', err)
                      }
                    }}
                    className="input" 
                    style={{ fontSize: 11, padding: '4px 8px', width: 140, height: 32 }}
                  >
                    <option value="non_compliant">NON-COMPLIANT</option>
                    <option value="partial">PARTIAL</option>
                    <option value="compliant">COMPLIANT</option>
                  </select>
                </div>
              </motion.div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
