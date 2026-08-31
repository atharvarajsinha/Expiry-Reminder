import { DetailList, SectionCard } from './DetailList.jsx';
import { DocumentStatus } from './DocumentStatus.jsx';
import { formatDate, formatExpiryDistance } from '../../utils/date.js';
import { resolveDocumentStatus } from '../../utils/status.js';

/**
 * Insurance or PUC on the detail page: the status badge in the header, then the
 * document's own fields with the expiry date last.
 *
 * `fields` are the document-specific rows (company/policy number, or
 * certificate number); the expiry row is added here so both documents present
 * it identically.
 */
export function DocumentCard({ icon, title, document, fields = [] }) {
  const { daysRemaining, expiresOn } = resolveDocumentStatus(document);
  const distance = formatExpiryDistance(daysRemaining);

  return (
    <SectionCard
      icon={icon}
      title={title}
      action={<DocumentStatus document={document} />}
    >
      <DetailList
        items={[
          ...fields,
          {
            label: 'Expiry',
            value: expiresOn ? (
              <time dateTime={expiresOn}>{formatDate(expiresOn)}</time>
            ) : null,
            hint: distance,
          },
        ]}
      />
    </SectionCard>
  );
}
