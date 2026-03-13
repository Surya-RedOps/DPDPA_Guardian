import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Swords, Plus, Clock, X, AlertTriangle, Trash2 } from 'lucide-react'
import api from '../../lib/axios'
import toast from 'react-hot-toast'
import { format, differenceInHours } from 'date-fns'

const STATUS_COLOR = { detected: 'var(--c3)', investigating: 'var(--c5)', contained: 'var(--c6)', notified: 'var(--c1)', closed: 'var(--c4)' }

export default function Breaches() {
  const [breaches, setBreaches] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [selectedBreach, setSelectedBreach] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', severity: 'high' })
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    fetchBreaches()
  }, [])

  const fetchBreaches = async () => {
    try {
      setLoading(true)
      const { data } = await api.get('/dashboard/breaches')
      setBreaches(data.data || [])
    } catch (err) {
      console.error('Failed to fetch breaches:', err)
      setBreaches([])
    } finally {
      setLoading(false)
    }
  }

  const handleCreateBreach = async () => {
    if (!form.title) {
      toast.error('Incident title is required')
      return
    }
    setCreating(true)
    try {
      await api.post('/dashboard/breaches', form)
      toast.success('Breach logged successfully')
      setShowModal(false)
      setForm({ title: '', description: '', severity: 'high' })
      fetchBreaches()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to log breach')
    } finally {
      setCreating(false)
    }
  }

  const handleDeleteBreach = async () => {
    if (!selectedBreach) return
    setDeleting(true)
    try {
      await api.delete(`/dashboard/breaches/${selectedBreach._id}`)
      toast.success('Breach deleted successfully')
      setShowDeleteModal(false)
      setSelectedBreach(null)
      fetchBreaches()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete breach')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, marginBottom: 4 }}>Breach Management</h1>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>72-hour DPB notification compliance tracking</div>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-danger">
          <Plus size={14} /> Log Breach
        </button>
      </div>

      <div style={{ padding: '12px 16px', background: 'rgba(255,77,109,0.05)', border: '1px solid rgba(255,77,109,0.15)', borderRadius: 8, marginBottom: 20, fontSize: 12, color: 'var(--text)', display: 'flex', gap: 10, alignItems: 'center' }}>
        <AlertTriangle size={14} style={{ color: 'var(--c3)', flexShrink: 0 }} />
        <span>Under DPDPA §8(6), data breaches must be reported to the Data Protection Board within <strong>72 hours</strong> of detection. Penalty for non-compliance: up to <strong>₹200 Crore</strong>.</span>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--muted)' }}>Loading breaches...</div>
      ) : breaches.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 24px', color: 'var(--muted)' }}>
          <Swords size={48} style={{ opacity: 0.3, marginBottom: 16 }} />
          <h3 style={{ color: 'var(--text)', marginBottom: 8 }}>No breach events</h3>
          <p>Log a breach event when a personal data incident is detected</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {breaches.map((breach, i) => {
            const hoursLeft = breach.notificationDeadline ? Math.max(0, 72 - differenceInHours(new Date(), new Date(breach.reportedAt))) : null
            const urgent = hoursLeft !== null && hoursLeft < 12
            return (
              <motion.div key={breach._id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                className="card" style={{ padding: '18px 20px', borderColor: urgent ? 'rgba(255,77,109,0.4)' : 'var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--text)', marginBottom: 4 }}>{breach.title || breach.description}</div>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>Reported: {format(new Date(breach.reportedAt), 'dd MMM yyyy, HH:mm')}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'JetBrains Mono', textTransform: 'uppercase' }}>
                        {breach.affectedRecords ? `${breach.affectedRecords} records` : 'Unknown'}
                      </span>
                    </div>
                  </div>
                  {hoursLeft !== null && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, background: urgent ? 'rgba(255,77,109,0.08)' : 'rgba(0,229,255,0.05)', border: `1px solid ${urgent ? 'rgba(255,77,109,0.2)' : 'rgba(0,229,255,0.1)'}` }}>
                      <Clock size={13} style={{ color: urgent ? 'var(--c3)' : 'var(--c1)' }} />
                      <span style={{ fontFamily: 'JetBrains Mono', fontSize: 12, color: urgent ? 'var(--c3)' : 'var(--c1)', fontWeight: 600 }}>
                        {hoursLeft}h remaining for DPB notification
                      </span>
                      {urgent && <span className="badge badge-critical" style={{ fontSize: 9 }}>URGENT</span>}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => {
                    setSelectedBreach(breach)
                    setShowDeleteModal(true)
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--muted)',
                    cursor: 'pointer',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    transition: 'all 0.2s',
                    marginLeft: '12px',
                    flexShrink: 0
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.background = 'rgba(255,77,109,0.1)'
                    e.target.style.color = 'var(--c3)'
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.background = 'none'
                    e.target.style.color = 'var(--muted)'
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </motion.div>
            )
          })}
        </div>
      )}

      {/* Create Breach Modal */}
      <AnimatePresence>
        {showModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
            onClick={(e) => e.target === e.currentTarget && setShowModal(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              style={{ background: 'var(--s1)', border: '1px solid rgba(255,77,109,0.3)', borderRadius: 16, padding: 28, width: '100%', maxWidth: 460 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h3 style={{ fontSize: 18, color: 'var(--c3)' }}>Log Breach Event</h3>
                <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}><X size={18} /></button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 6, fontFamily: 'JetBrains Mono' }}>INCIDENT DESCRIPTION</label>
                  <input className="input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Describe the breach incident" />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 6, fontFamily: 'JetBrains Mono' }}>AFFECTED RECORDS</label>
                  <input className="input" type="number" value={form.affectedRecords || ''} onChange={e => setForm(f => ({ ...f, affectedRecords: parseInt(e.target.value) || 0 }))} placeholder="Number of affected records" />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 6, fontFamily: 'JetBrains Mono' }}>DATA TYPES AFFECTED</label>
                  <input className="input" value={form.dataTypes || ''} onChange={e => setForm(f => ({ ...f, dataTypes: e.target.value }))} placeholder="e.g., Aadhaar, PAN, Email" />
                </div>
                <div style={{ padding: '10px 12px', background: 'rgba(255,77,109,0.05)', borderRadius: 8, fontSize: 12, color: 'var(--muted)', border: '1px solid rgba(255,77,109,0.1)' }}>
                  ⚠️ 72-hour countdown starts immediately upon logging
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => setShowModal(false)} className="btn-secondary" style={{ flex: 1, justifyContent: 'center' }}>Cancel</button>
                  <button onClick={handleCreateBreach} disabled={!form.title || creating} className="btn-danger" style={{ flex: 1, justifyContent: 'center' }}>
                    {creating ? 'Logging...' : 'Log Breach'}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Breach Modal */}
      <AnimatePresence>
        {showDeleteModal && selectedBreach && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
            onClick={(e) => e.target === e.currentTarget && setShowDeleteModal(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              style={{ background: 'var(--s1)', border: '1px solid rgba(211,47,47,0.4)', borderRadius: 16, padding: 28, width: '100%', maxWidth: 400 }}>
              <div style={{ display: 'flex', gap: 12, marginBottom: 18, alignItems: 'flex-start' }}>
                <AlertTriangle size={22} color="#D32F2F" style={{ flexShrink: 0, marginTop: 2 }} />
                <div>
                  <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 6 }}>Delete Breach Record?</div>
                  <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
                    This will permanently delete the breach record for "{selectedBreach.description}". This action cannot be undone.
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button onClick={() => setShowDeleteModal(false)} className="btn-secondary" style={{ fontSize: 13 }}>Cancel</button>
                <button onClick={handleDeleteBreach} disabled={deleting}
                  style={{ background: '#D32F2F', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 20px', cursor: deleting ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 500, opacity: deleting ? 0.7 : 1 }}>
                  {deleting ? 'Deleting…' : 'Delete Breach'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
