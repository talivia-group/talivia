'use client';

import { Button, Column, Heading, Row, Text, useToast } from '@talivia/react-zen';
import { useSearchParams } from 'next/navigation';
import { PageBody } from '@/components/common/PageBody';
import { Panel } from '@/components/common/Panel';
import { useMessages, useModified, useNavigation } from '@/components/hooks';
import { WebsiteEditForm } from '../../websites/[websiteId]/settings/WebsiteEditForm';
import { WebsiteRevenueConnect } from '../../websites/[websiteId]/settings/WebsiteRevenueSettings';
import { WebsiteTrackingCode } from '../../websites/[websiteId]/settings/WebsiteTrackingCode';
import { WebsiteAddForm } from '../../websites/WebsiteAddForm';
import { WebsiteProvider } from '../../websites/WebsiteProvider';

const CARD_STYLE = {
  background: '#161616',
  borderColor: '#ffffff12',
  borderRadius: 22,
} as const;

const STEP_ORDER = ['details', 'tracking', 'revenue'] as const;
type OnboardingStep = (typeof STEP_ORDER)[number];

const STEP_LABELS: Record<OnboardingStep, string> = {
  details: 'Website',
  tracking: 'Tracker',
  revenue: 'Revenue',
};

function getStep(value?: string | null): OnboardingStep {
  return STEP_ORDER.includes(value as OnboardingStep) ? (value as OnboardingStep) : 'details';
}

function Stepper({
  step,
  websiteId,
  goToStep,
}: {
  step: OnboardingStep;
  websiteId?: string;
  goToStep: (nextStep: OnboardingStep) => void;
}) {
  const activeIndex = STEP_ORDER.indexOf(step);

  return (
    <Row gap="2" wrap="wrap" alignItems="center">
      {STEP_ORDER.map((item, index) => {
        const isActive = item === step;
        const isAvailable = item === 'details' || !!websiteId;

        return (
          <button
            key={item}
            type="button"
            disabled={!isAvailable}
            onClick={() => isAvailable && goToStep(item)}
            style={{
              alignItems: 'center',
              background: isActive ? '#ffffff12' : 'transparent',
              border: '1px solid #ffffff12',
              borderColor: isActive ? '#3b82ff' : '#ffffff12',
              borderRadius: 999,
              color: index <= activeIndex ? '#f5f5f5' : '#9ca3af',
              cursor: isAvailable ? 'pointer' : 'not-allowed',
              display: 'inline-flex',
              font: 'inherit',
              fontWeight: 700,
              gap: 8,
              minHeight: 38,
              opacity: isAvailable ? 1 : 0.5,
              padding: '0 14px',
            }}
          >
            <span
              aria-hidden
              style={{
                alignItems: 'center',
                background: isActive ? '#3b82ff' : '#ffffff12',
                borderRadius: 999,
                display: 'inline-flex',
                height: 20,
                justifyContent: 'center',
                width: 20,
              }}
            >
              {index + 1}
            </span>
            {STEP_LABELS[item]}
          </button>
        );
      })}
    </Row>
  );
}

export function WebsiteOnboardingPage() {
  const searchParams = useSearchParams();
  const { router } = useNavigation();
  const { t, messages } = useMessages();
  const { touch } = useModified();
  const { toast } = useToast();
  const step = getStep(searchParams.get('step'));
  const websiteId = searchParams.get('websiteId') || undefined;

  const buildWizardUrl = (nextStep: OnboardingStep, nextWebsiteId = websiteId) => {
    const params = new URLSearchParams();

    params.set('step', nextStep);

    if (nextWebsiteId) {
      params.set('websiteId', nextWebsiteId);
    }

    return `/app/new?${params.toString()}`;
  };

  const goToStep = (nextStep: OnboardingStep) => {
    router.push(buildWizardUrl(nextStep));
  };

  const finish = () => {
    if (websiteId) {
      router.push(`/app/${websiteId}`);
    } else {
      router.push('/app');
    }
  };

  const handleWebsiteCreated = (website?: any) => {
    const nextWebsiteId = website?.id;

    touch('websites');
    toast(t(messages.saved));

    if (nextWebsiteId) {
      router.push(buildWizardUrl('tracking', nextWebsiteId));
    }
  };

  return (
    <PageBody maxWidth="860px">
      <Column gap="5" margin="2" paddingTop={{ base: '5', md: '8' }}>
        <Column gap="2">
          <Heading size="lg">Add website</Heading>
          <Text color="muted">
            Create the website, install the tracker, then connect revenue when you are ready.
          </Text>
        </Column>

        <Panel style={CARD_STYLE} gap="6">
          <Stepper step={step} websiteId={websiteId} goToStep={goToStep} />

          {step === 'details' && (
            <Column gap="4">
              <Column gap="1">
                <Heading size="base">Website details</Heading>
                <Text color="muted">Add the primary domain you want to track.</Text>
              </Column>
              {websiteId ? (
                <WebsiteProvider websiteId={websiteId}>
                  <WebsiteEditForm
                    websiteId={websiteId}
                    showId={false}
                    showName={false}
                    submitLabel="Continue"
                    onSave={() => goToStep('tracking')}
                  />
                </WebsiteProvider>
              ) : (
                <WebsiteAddForm onSave={handleWebsiteCreated} submitLabel="Create website" />
              )}
            </Column>
          )}

          {step === 'tracking' && (
            <Column gap="5">
              <Column gap="1">
                <Heading size="base">Install tracker</Heading>
                <Text color="muted">
                  Add this script before the closing body tag on every page you want Talivia to
                  measure.
                </Text>
              </Column>
              {websiteId ? (
                <>
                  <WebsiteTrackingCode websiteId={websiteId} />
                  <Row justifyContent="flex-end" gap="3" wrap="wrap">
                    <Button className="talivia-control" onPress={() => goToStep('revenue')}>
                      Skip for now
                    </Button>
                    <Button
                      className="talivia-control"
                      variant="primary"
                      onPress={() => goToStep('revenue')}
                    >
                      Continue
                    </Button>
                  </Row>
                </>
              ) : (
                <Text color="muted">Create the website first to generate its tracking code.</Text>
              )}
            </Column>
          )}

          {step === 'revenue' && (
            <Column gap="5">
              {websiteId ? (
                <>
                  <WebsiteRevenueConnect websiteId={websiteId} isCompact />
                  <Row justifyContent="flex-end" gap="3" wrap="wrap">
                    <Button className="talivia-control" onPress={finish}>
                      Skip for now
                    </Button>
                    <Button className="talivia-control" variant="primary" onPress={finish}>
                      Finish
                    </Button>
                  </Row>
                </>
              ) : (
                <Text color="muted">Create the website first to connect revenue.</Text>
              )}
            </Column>
          )}
        </Panel>
      </Column>
    </PageBody>
  );
}
