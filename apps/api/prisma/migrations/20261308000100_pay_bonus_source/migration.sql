-- PAY-24: one-time pay sent from an approved statutory bonus computation carries source 'bonus' (source_ref = the computation).
ALTER TABLE "one_time_pays" DROP CONSTRAINT "one_time_pays_source_check";
ALTER TABLE "one_time_pays" ADD CONSTRAINT "one_time_pays_source_check" CHECK ("source" IN ('manual', 'm05', 'm06', 'm09', 'm10', 'm08', 'm01', 'loan', 'arrears', 'fnf', 'piece', 'incentive', 'tips', 'oncall', 'union', 'layoff', 'vrs', 'settle', 'ewa', 'bonus'));
