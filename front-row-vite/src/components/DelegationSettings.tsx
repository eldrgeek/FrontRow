import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './DelegationSettings.css';

export function DelegationSettings() {
  const navigate = useNavigate();
  const { agents, agentFor, revokeDelegation } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function handleRevokeAgent(agentId: string) {
    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      await revokeDelegation(agentId);
      setSuccessMessage('Delegation revoked successfully');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to revoke delegation';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="delegation-container">
      <header className="delegation-header">
        <button onClick={() => navigate('/')} className="btn-back">
          ← Back to Lobby
        </button>
        <h1>Delegation Settings</h1>
      </header>

      <main className="delegation-main">
        {error && <div className="delegation-error">{error}</div>}
        {successMessage && <div className="delegation-success">{successMessage}</div>}

        <div className="delegation-sections">
          <section className="delegation-section">
            <h2>Your Agents</h2>
            <p className="section-subtitle">
              People and AI systems you've delegated authority to. They can act on your behalf.
            </p>

            {agents.length === 0 ? (
              <div className="delegation-empty">
                <p>You haven't delegated to anyone yet.</p>
                <p className="empty-hint">Delegation allows others to act on your behalf within FrontRow.</p>
              </div>
            ) : (
              <div className="agent-list">
                {agents.map((agent) => (
                  <div key={agent.id} className="agent-item">
                    <div className="agent-info">
                      <h3>{agent.email}</h3>
                      {agent.is_ai && <span className="badge badge-ai">AI</span>}
                    </div>
                    <button
                      onClick={() => handleRevokeAgent(agent.id)}
                      disabled={loading}
                      className="btn btn-danger"
                    >
                      Revoke
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="delegation-section">
            <h2>Agent For</h2>
            <p className="section-subtitle">
              People who have delegated authority to you. You can act on their behalf.
            </p>

            {agentFor.length === 0 ? (
              <div className="delegation-empty">
                <p>No one has delegated to you yet.</p>
                <p className="empty-hint">When others delegate to you, their names will appear here.</p>
              </div>
            ) : (
              <div className="agent-for-list">
                {agentFor.map((principal) => (
                  <div key={principal.id} className="principal-item">
                    <div className="principal-info">
                      <h3>{principal.email}</h3>
                      <span className="badge badge-principal">Principal</span>
                    </div>
                    <p className="principal-hint">You can act on this user's behalf</p>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="delegation-section info-section">
            <h2>About Delegation</h2>
            <div className="info-content">
              <p>
                <strong>Delegation</strong> allows you to grant authority to other users or AI systems to act on your behalf in FrontRow.
              </p>
              <ul>
                <li>
                  <strong>Your Agents:</strong> People/AIs you trust to make decisions for you. They can participate in venues, provide feedback, and more on your behalf.
                </li>
                <li>
                  <strong>Agent For:</strong> Users who have delegated to you. You can act on their behalf when they authorize you.
                </li>
                <li>
                  <strong>No Permission Scoping:</strong> Delegation is trust-based. When you delegate to someone, they have the same access you do in FrontRow.
                </li>
                <li>
                  <strong>Audit Trail:</strong> All actions performed on your behalf are logged with both the actor and principal recorded.
                </li>
              </ul>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
