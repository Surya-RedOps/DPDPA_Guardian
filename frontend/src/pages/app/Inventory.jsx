import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Package, ChevronDown, ChevronRight, AlertTriangle, Trash2, FileText, Shield } from 'lucide-react'
import api from '../../lib/axios'
import toast from 'react-hot-toast'

const SENSITIVITY_COLOR = { 
  sensitive_personal: '#EF4444', 
  personal: '#F59E0B', 
  internal: '#3B82F6', 
  public: '#10B981' 
}

export default function Inventory() {
  const [items, setItems] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sensitivity, setSensitivity] = useState('')
  const [expandedRow, setExpandedRow] = useState(null)
  const [showClearModal, setShowClearModal] = useState(false)
  const [clearing, setClearing] = useState(false)

  useEffect(() => {
    fetchInventory()
    fetchStats()
  }, [search, sensitivity])

  const fetchInventory = async () => {
    try {
      setLoading(true)
      const { data } = await api.get('/dashboard/inventory', { params: { search, sensitivity, limit: 50 } })
      setItems(data.data?.findings || [])
    } catch (err) {
      console.error('Failed to fetch inventory:', err)
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  const fetchStats = async () => {
    try {
      const { data } = await api.get('/dashboard/inventory/stats')
      setStats(data.data || {})
    } catch (err) {
      console.error('Failed to fetch stats:', err)
    }
  }

  const handleClearData = async () => {
    setClearing(true)
    try {
      await api.delete('/dashboard/inventory/clear')
      toast.success('All inventory data cleared')
      setShowClearModal(false)
      setItems([])
      setStats({})
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to clear data')
    } finally {
      setClearing(false)
    }
  }

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Data Asset Inventory</h1>
          <p style={{ fontSize: 13, color: 'var(--muted)' }}>Discovered PII assets across data sources</p>
        </div>
        <button
          onClick={() => setShowClearModal(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 14px',
            background: 'transparent',
            color: '#EF4444',
            border: '1px solid #EF4444',
            borderRadius: 6,
            cursor: 'pointer',
            fontWeight: 500,
            fontSize: 13
          }}
        >
          <Trash2 size={14} /> Clear Data
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Total', val: stats?.total || items.length || 0, color: '#3B82F6' },
          { label: 'Sensitive', val: stats?.sensitive_personal || 0, color: '#EF4444' },
          { label: 'Personal', val: stats?.personal || 0, color: '#F59E0B' },
          { label: 'Internal', val: stats?.internal || 0, color: '#10B981' },
        ].map((s, i) => (
          <div key={i} style={{
            background: 'var(--s1)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '12px 16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>{s.label}</span>
            <span style={{ fontSize: 20, fontWeight: 700, color: s.color, fontFamily: 'Syne' }}>{s.val}</span>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
          <input 
            className="input" 
            style={{ paddingLeft: 36, height: 38, fontSize: 13 }} 
            placeholder="Search files..." 
            value={search} 
            onChange={e => setSearch(e.target.value)} 
          />
        </div>
        <select 
          className="input" 
          value={sensitivity} 
          onChange={e => setSensitivity(e.target.value)} 
          style={{ width: 200, height: 38, fontSize: 13 }}
        >
          <option value="">All Levels</option>
          <option value="sensitive_personal">Sensitive Personal</option>
          <option value="personal">Personal</option>
          <option value="internal">Internal</option>
          <option value="public">Public</option>
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--muted)', fontSize: 13 }}>
          Loading...
        </div>
      ) : items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 24px', background: 'var(--s1)', border: '1px solid var(--border)', borderRadius: 8 }}>
          <Package size={40} style={{ opacity: 0.2, marginBottom: 12, color: 'var(--muted)' }} />
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>No assets found</h3>
          <p style={{ fontSize: 13, color: 'var(--muted)' }}>Run a scan to populate inventory</p>
        </div>
      ) : (
        <div style={{ background: 'var(--s1)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          {/* Table Header */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '32px 2fr 140px 200px 80px 120px',
            gap: 16,
            padding: '12px 16px',
            background: 'var(--s2)',
            borderBottom: '1px solid var(--border)',
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.5px'
          }}>
            <span></span>
            <span>File / Path</span>
            <span>Sensitivity</span>
            <span>PII Types</span>
            <span>Risk</span>
            <span>Status</span>
          </div>

          {/* Table Rows */}
          {items.map((item, i) => (
            <React.Fragment key={item._id}>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.02 }}
                onClick={() => setExpandedRow(expandedRow === item._id ? null : item._id)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '32px 2fr 140px 200px 80px 120px',
                  gap: 16,
                  padding: '14px 16px',
                  borderBottom: '1px solid var(--border)',
                  cursor: 'pointer',
                  alignItems: 'center',
                  transition: 'background 0.15s',
                  background: expandedRow === item._id ? 'var(--s2)' : 'transparent'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--s2)'}
                onMouseLeave={(e) => e.currentTarget.style.background = expandedRow === item._id ? 'var(--s2)' : 'transparent'}
              >
                {/* Expand Icon */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {expandedRow === item._id ? 
                    <ChevronDown size={16} color="var(--text)" /> : 
                    <ChevronRight size={16} color="var(--muted)" />
                  }
                </div>

                {/* File Info */}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.fileName || 'Unnamed File'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'JetBrains Mono', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.assetPath || 'No path'}
                  </div>
                </div>

                {/* Sensitivity */}
                <div>
                  <span style={{
                    display: 'inline-block',
                    padding: '4px 10px',
                    borderRadius: 4,
                    fontSize: 10,
                    fontWeight: 600,
                    fontFamily: 'JetBrains Mono',
                    textTransform: 'uppercase',
                    background: `${SENSITIVITY_COLOR[item.sensitivityLevel]}15`,
                    color: SENSITIVITY_COLOR[item.sensitivityLevel],
                    border: `1px solid ${SENSITIVITY_COLOR[item.sensitivityLevel]}30`
                  }}>
                    {item.sensitivityLevel?.replace('_', ' ') || 'Unknown'}
                  </span>
                </div>

                {/* PII Types */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {(item.detectedPII || []).slice(0, 3).map((p, j) => (
                    <span key={j} style={{
                      fontSize: 9,
                      padding: '3px 6px',
                      borderRadius: 3,
                      background: 'var(--c1)15',
                      color: 'var(--c1)',
                      fontFamily: 'JetBrains Mono',
                      fontWeight: 600
                    }}>
                      {p.piiType}
                    </span>
                  ))}
                  {item.detectedPII?.length > 3 && (
                    <span style={{
                      fontSize: 9,
                      padding: '3px 6px',
                      borderRadius: 3,
                      background: 'var(--s2)',
                      color: 'var(--muted)',
                      fontFamily: 'JetBrains Mono'
                    }}>
                      +{item.detectedPII.length - 3}
                    </span>
                  )}
                </div>

                {/* Risk Score */}
                <div style={{ textAlign: 'center' }}>
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 40,
                    height: 40,
                    borderRadius: '50%',
                    background: item.riskScore >= 80 ? '#FEE2E2' : item.riskScore >= 60 ? '#FEF3C7' : '#D1FAE5',
                    border: `2px solid ${item.riskScore >= 80 ? '#EF4444' : item.riskScore >= 60 ? '#F59E0B' : '#10B981'}`,
                    fontFamily: 'Syne',
                    fontWeight: 700,
                    fontSize: 14,
                    color: item.riskScore >= 80 ? '#DC2626' : item.riskScore >= 60 ? '#D97706' : '#059669'
                  }}>
                    {item.riskScore || 0}
                  </span>
                </div>

                {/* Status */}
                <div onClick={(e) => e.stopPropagation()}>
                  <select 
                    value={item.remediationStatus || 'pending'}
                    onChange={async (e) => {
                      try {
                        await api.patch(`/dashboard/inventory/${item._id}`, { status: e.target.value })
                        fetchInventory()
                        toast.success('Updated')
                      } catch (err) {
                        toast.error('Failed')
                      }
                    }}
                    className="input" 
                    style={{ fontSize: 11, padding: '6px 8px', height: 32, fontWeight: 500 }}
                  >
                    <option value="pending">Pending</option>
                    <option value="in_progress">In Progress</option>
                    <option value="resolved">Resolved</option>
                    <option value="accepted_risk">Accepted</option>
                  </select>
                </div>
              </motion.div>

              {/* Expanded Details */}
              <AnimatePresence>
                {expandedRow === item._id && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    style={{ overflow: 'hidden', borderBottom: '1px solid var(--border)' }}
                  >
                    <div style={{ padding: '16px', background: 'var(--s2)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                        <Shield size={16} color="#EF4444" />
                        <span style={{ fontSize: 13, fontWeight: 600 }}>
                          PII Details ({item.detectedPII?.length || 0} instances)
                        </span>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {(item.detectedPII || []).map((pii, idx) => (
                          <div key={idx} style={{
                            background: 'var(--s1)',
                            border: '1px solid var(--border)',
                            borderRadius: 6,
                            padding: '10px 12px',
                            display: 'grid',
                            gridTemplateColumns: '100px 160px 1fr 70px',
                            gap: 12,
                            alignItems: 'center',
                            fontSize: 12
                          }}>
                            <div>
                              <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 4, fontWeight: 600 }}>TYPE</div>
                              <span style={{
                                fontSize: 10,
                                padding: '3px 8px',
                                borderRadius: 4,
                                background: '#FEE2E2',
                                color: '#DC2626',
                                fontFamily: 'JetBrains Mono',
                                fontWeight: 600
                              }}>
                                {pii.piiType}
                              </span>
                            </div>
                            <div>
                              <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 4, fontWeight: 600 }}>VALUE</div>
                              <div style={{
                                fontFamily: 'JetBrains Mono',
                                fontSize: 11,
                                color: '#DC2626',
                                background: 'var(--s2)',
                                padding: '4px 8px',
                                borderRadius: 4,
                                fontWeight: 600,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                              }}>
                                {pii.maskedValue || '***'}
                              </div>
                            </div>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 4, fontWeight: 600 }}>CONTEXT</div>
                              <div style={{
                                fontSize: 11,
                                color: 'var(--text)',
                                fontFamily: 'JetBrains Mono',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                              }}>
                                {pii.contextSnippet || 'N/A'}
                              </div>
                            </div>
                            <div style={{ textAlign: 'center', flexShrink: 0 }}>
                              <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 4, fontWeight: 600 }}>CONF</div>
                              <div style={{ fontSize: 14, fontWeight: 700, color: '#10B981', fontFamily: 'Syne' }}>
                                {Math.round((pii.confidence || 0.95) * 100)}%
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div style={{
                        marginTop: 12,
                        padding: '10px 12px',
                        background: '#FEF3C7',
                        borderRadius: 6,
                        border: '1px solid #FDE68A',
                        fontSize: 11,
                        color: '#78350F',
                        lineHeight: 1.5
                      }}>
                        <strong>⚠️ DPDPA 2023:</strong> {item.detectedPII?.length || 0} PII instances detected (Risk: {item.riskScore}). 
                        Implement security safeguards per Section 8.
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </React.Fragment>
          ))}
        </div>
      )}

      {/* Clear Modal */}
      {showClearModal && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            zIndex: 300,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24
          }}
        >
          <motion.div
            initial={{ scale: 0.95 }}
            animate={{ scale: 1 }}
            style={{
              background: 'var(--s1)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              padding: 24,
              maxWidth: 400,
              width: '100%'
            }}
          >
            <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'flex-start' }}>
              <AlertTriangle size={20} color="#EF4444" />
              <div>
                <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>Clear All Data?</div>
                <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>
                  This will permanently delete all scan results and PII findings. This cannot be undone.
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowClearModal(false)} className="btn-secondary" style={{ fontSize: 13, padding: '8px 16px' }}>
                Cancel
              </button>
              <button
                onClick={handleClearData}
                disabled={clearing}
                style={{
                  background: '#EF4444',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  padding: '8px 16px',
                  cursor: clearing ? 'not-allowed' : 'pointer',
                  fontSize: 13,
                  fontWeight: 500,
                  opacity: clearing ? 0.7 : 1
                }}
              >
                {clearing ? 'Clearing...' : 'Clear All'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </div>
  )
}
