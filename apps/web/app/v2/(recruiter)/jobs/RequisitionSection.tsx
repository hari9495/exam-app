'use client';

// v2 Requisition section — editable requisition fields (department/hiring manager/headcount/
// salary) plus the submit/cancel approval controls. Only ever shows submit/cancel UI for
// draft/pending_approval jobs; an org with the requisition gate off never leaves 'open', so this
// renders as a plain fields editor with no approval clutter for the un-gated default.
import { useState } from 'react';
import { useUpdateJob, useSubmitRequisition, useCancelRequisition } from '../../../../lib/hooks/usePipeline';
import { useTeammates } from '../../../../lib/hooks/useUserDirectory';
import { JobDetail } from '../../../../lib/types';
import { useToast } from '../../../../components/ui';
import { TextField, Combobox, Button, ApprovalTimeline, dt } from '../../../../components/ui-v2';

export function RequisitionSection({ job, jobId }: { job: JobDetail; jobId: string }) {
  const updateJob = useUpdateJob(jobId);
  const submitRequisition = useSubmitRequisition();
  const cancelRequisition = useCancelRequisition();
  const { toast } = useToast();
  const { data: teammates } = useTeammates();

  const [department, setDepartment] = useState(job.department ?? '');
  const [hiringManagerId, setHiringManagerId] = useState(job.hiringManagerId ?? '');
  const [headcount, setHeadcount] = useState(job.headcount != null ? String(job.headcount) : '');
  const [salaryMin, setSalaryMin] = useState(job.salaryMin != null ? String(job.salaryMin) : '');
  const [salaryMax, setSalaryMax] = useState(job.salaryMax != null ? String(job.salaryMax) : '');
  const [salaryCurrency, setSalaryCurrency] = useState(job.salaryCurrency ?? '');

  // Mirrors the API's field-locking guard (pipeline.service.ts updateJob): while pending
  // approval, requisition fields are locked until the request is cancelled.
  const locked = job.status === 'pending_approval';
  const managerOptions = [{ value: '', label: 'None' }, ...(teammates ?? []).map((t) => ({ value: t.id, label: t.name ?? t.email }))];

  function handleSave() {
    updateJob.mutate({
      department: department.trim() || undefined,
      hiringManagerId: hiringManagerId || undefined,
      headcount: headcount.trim() ? Number(headcount) : undefined,
      salaryMin: salaryMin.trim() ? Number(salaryMin) : undefined,
      salaryMax: salaryMax.trim() ? Number(salaryMax) : undefined,
      salaryCurrency: salaryCurrency.trim() || undefined,
    }, {
      onSuccess: () => toast('Requisition details saved.'),
      onError: (error) => toast(error instanceof Error ? error.message : 'Failed to save requisition details.', 'error'),
    });
  }
  function handleSubmit() {
    submitRequisition.mutate(jobId, {
      onSuccess: () => toast('Requisition submitted for approval.'),
      onError: (error) => toast(error instanceof Error ? error.message : 'Failed to submit for approval.', 'error'),
    });
  }
  function handleCancel() {
    cancelRequisition.mutate(jobId, {
      onSuccess: () => toast('Approval request cancelled.'),
      onError: (error) => toast(error instanceof Error ? error.message : 'Failed to cancel approval.', 'error'),
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {job.status === 'pending_approval' && job.approval && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <ApprovalTimeline steps={job.approval.steps} currentStep={job.approval.currentStep} />
          <button type="button" onClick={handleCancel} disabled={cancelRequisition.isPending} className="v2-hoverbtn" style={{ ...dt.toolBtn, alignSelf: 'flex-start' }}>Cancel approval</button>
        </div>
      )}
      {job.status === 'draft' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {job.approval?.status === 'rejected' && <span style={{ fontSize: 12.5, color: 'var(--danger)' }}>Rejected — back to draft. Edit and resubmit when ready.</span>}
          {job.approval?.status === 'cancelled' && <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>Approval cancelled.</span>}
          <Button onClick={handleSubmit} loading={submitRequisition.isPending}>Submit for approval</Button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14, maxWidth: 640 }}>
        <TextField id="req-department" label="Department" value={department} onChange={setDepartment} autoComplete="off" />
        <div>
          <label className="v2-label">Hiring manager</label>
          <Combobox options={managerOptions} value={hiringManagerId} onChange={setHiringManagerId} placeholder="None" width="100%" />
        </div>
        <TextField id="req-headcount" label="Headcount" type="number" value={headcount} onChange={setHeadcount} autoComplete="off" />
        <TextField id="req-currency" label="Currency" value={salaryCurrency} onChange={setSalaryCurrency} placeholder="USD" autoComplete="off" />
        <TextField id="req-salary-min" label="Salary min" type="number" value={salaryMin} onChange={setSalaryMin} autoComplete="off" />
        <TextField id="req-salary-max" label="Salary max" type="number" value={salaryMax} onChange={setSalaryMax} autoComplete="off" />
      </div>
      {locked && <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>Cancel the pending approval to edit these details.</p>}
      <div><Button onClick={handleSave} loading={updateJob.isPending} disabled={locked}>Save requisition details</Button></div>
    </div>
  );
}
